import { ClientSession } from "mongoose";
import { Warranty } from "./warranty.model";
import { Product } from "../product/product.model";
import { ApiError } from "../../utils/apiError";
import { refIdString } from "../../utils/ids";
import {
  SubmitWarrantyClaimInput,
  AdminUpdateClaimInput,
  GetWarrantiesQuery,
} from "./warranty.validator";

/**
 * Add `months` calendar months to a date, clamped to the last valid day of the
 * target month so that e.g. Jan 31 + 1 month lands on Feb 28/29 (not Mar 3).
 */
function addMonthsClamped(from: Date, months: number): Date {
  const target = new Date(from);
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return target;
}

/**
 * Report an "active" warranty that has already passed its expiry date as
 * expired. The status column is only rewritten by the daily sweep, so this
 * keeps responses honest on hosts where the sweep has not run yet.
 */
function withEffectiveStatus<T extends { status?: string; expiryDate?: any }>(w: T): T {
  if (w?.status === "active" && w.expiryDate && new Date(w.expiryDate) < new Date()) {
    return { ...w, status: "expired" };
  }
  return w;
}

/**
 * Create warranty records for every item in a delivered order that has a
 * warranty period configured on the product. Called from the order service
 * when an order transitions to "delivered".
 *
 * Idempotent: a warranty is only created once per (user, product, order).
 */
export async function createWarrantiesForOrder(
  orderId: string,
  userId: string,
  items: { productId: any; quantity?: number }[],
  session?: ClientSession
): Promise<number> {
  let created = 0;
  for (const item of items || []) {
    const productId = refIdString(item?.productId);
    if (!productId) continue;

    const product = session
      ? await Product.findById(productId).session(session).lean()
      : await Product.findById(productId).lean();
    if (!product) continue;
    const months = product.warrantyPeriodMonths;
    if (!months || months <= 0) continue;

    // One warranty per (user, product, order) — never duplicate on re-delivery.
    const existing = session
      ? await Warranty.findOne({ userId, productId, orderId }).session(session)
      : await Warranty.findOne({ userId, productId, orderId });
    if (existing) continue;

    const activationDate = new Date();
    const expiryDate = addMonthsClamped(activationDate, months);

    const warranty = new Warranty({
      userId,
      productId,
      orderId,
      activationDate,
      expiryDate,
      status: "active",
    });
    await warranty.save({ session });
    created++;
  }
  return created;
}

/**
 * Re-evaluate warranty statuses that have passed their expiry date.
 */
export async function expireStaleWarranties(): Promise<number> {
  const result = await Warranty.updateMany(
    {
      status: "active",
      expiryDate: { $lte: new Date() },
    },
    { $set: { status: "expired" } }
  );
  return result.modifiedCount || 0;
}

/**
 * Close out every open warranty that belongs to an order. Called when a
 * delivered order is cancelled or returned, so the customer cannot keep
 * claiming coverage for goods they no longer own.
 */
export async function voidWarrantiesForOrder(
  orderId: string,
  session?: ClientSession
): Promise<number> {
  const result = await Warranty.updateMany(
    {
      orderId,
      status: { $in: ["active", "claim_submitted", "under_review", "info_requested"] },
    },
    { $set: { status: "expired" } },
    { session }
  );
  return result.modifiedCount || 0;
}

/**
 * Fetch the single warranty record for one (user, order, product) triple.
 * Returns null when no warranty exists — the caller decides what to show.
 */
export async function getWarrantyForOrderItem(
  orderId: string,
  productId: string,
  userId: string
) {
  const warranty = await Warranty.findOne({
    orderId,
    productId,
    userId,
  })
    .populate("productId", "title slug image price warrantyPeriodMonths warrantyType warrantyTerms")
    .populate("orderId", "orderStatus totalAmount orderNumber")
    .lean();

  if (!warranty) return null;

  return formatWarranty(warranty);
}

/**
 * Fetch warranties for a customer, optionally filtered by status.
 */
export async function getWarranties(query: GetWarrantiesQuery) {
  const { userId, productId, orderId, status, page, limit } = query;
  const filter: any = {};
  if (userId) filter.userId = userId;
  if (productId) filter.productId = productId;
  if (orderId) filter.orderId = orderId;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [warranties, total] = await Promise.all([
    Warranty.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("productId", "title slug image price warrantyPeriodMonths warrantyType warrantyTerms")
      .populate("orderId", "orderStatus totalAmount orderNumber")
      .populate("userId", "name email")
      .lean(),
    Warranty.countDocuments(filter),
  ]);

  return {
    warranties: warranties.map((w) => withEffectiveStatus(w)),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/**
 * A customer submits a claim for one of their own warranties.
 * Server-side checks:
 *   - the warranty exists and belongs to the caller
 *   - the warranty is still active (not expired, not already claimed)
 */
export async function submitClaim(
  warrantyId: string,
  data: SubmitWarrantyClaimInput,
  userId: string
) {
  const warranty = await Warranty.findById(warrantyId);
  if (!warranty) throw new ApiError(404, "Warranty not found");
  if (warranty.userId.toString() !== userId) {
    throw new ApiError(403, "You can only claim your own warranty");
  }
  if (warranty.status !== "active") {
    throw new ApiError(400, "This warranty is no longer active");
  }
  if (warranty.expiryDate && warranty.expiryDate < new Date()) {
    throw new ApiError(400, "This warranty has expired");
  }

  warranty.status = "claim_submitted";
  warranty.claimReason = data.reason;
  warranty.claimDescription = data.description;
  warranty.claimImages = data.images || [];
  await warranty.save();

  return formatWarranty(warranty);
}

/**
 * Admin actions on a claim.
 *   mark_under_review -> status = under_review
 *   request_info      -> status = info_requested, admin note recorded
 *   resolve           -> status = resolved, resolution recorded
 *   reject            -> status = expired (claim rejected, warranty consumed)
 */
export async function adminUpdateClaim(
  warrantyId: string,
  data: AdminUpdateClaimInput
) {
  const warranty = await Warranty.findById(warrantyId);
  if (!warranty) throw new ApiError(404, "Warranty not found");

  switch (data.action) {
    case "mark_under_review":
      warranty.status = "under_review";
      break;
    case "request_info":
      warranty.status = "info_requested";
      warranty.claimAdminNote = data.adminNote ?? warranty.claimAdminNote;
      break;
    case "resolve":
      warranty.status = "resolved";
      warranty.resolutionDetails = data.resolution ?? data.adminNote ?? "";
      warranty.claimAdminNote = data.adminNote ?? warranty.claimAdminNote;
      break;
    case "reject":
      warranty.status = "expired";
      warranty.resolutionDetails = data.resolution ?? data.adminNote ?? "Claim rejected";
      warranty.claimAdminNote = data.adminNote ?? warranty.claimAdminNote;
      break;
    default:
      throw new ApiError(400, "Unknown action");
  }

  await warranty.save();
  return formatWarranty(warranty);
}

function formatWarranty(w: any) {
  return withEffectiveStatus({
    id: w._id.toString(),
    userId: w?.userId?.toString?.(),
    productId: refIdString(w?.productId),
    orderId: refIdString(w?.orderId),
    activationDate: w.activationDate,
    expiryDate: w.expiryDate,
    status: w.status,
    claimReason: w.claimReason,
    claimDescription: w.claimDescription,
    claimImages: Array.isArray(w.claimImages) ? w.claimImages : [],
    claimAdminNote: w.claimAdminNote,
    resolutionDetails: w.resolutionDetails,
  });
}