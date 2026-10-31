import { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import { Coupon } from "./coupon.model";
import { Product } from "../product/product.model";
import { ApiError } from "../../utils/apiError";
import type { CouponQuery, CreateCouponInput, UpdateCouponInput } from "./coupon.validator";

/**
 * One discount code, read by two desks and spent by one checkout.
 *
 * The store team's own codes and a seller's codes are the same document with a
 * different owner, so the checkout has a single validator instead of two sets of
 * rules that could drift. What an owner may narrow a code to is decided by
 * `ownerType`: an admin's code can name any product in the store, while a
 * vendor's code only ever touches that vendor's own lines — a seller cannot
 * discount somebody else's catalogue or the platform's stock.
 *
 * The discount is always recomputed here from the prices in the database. A
 * screen may show an estimate, but only this file decides what the order pays.
 */

/** A priced line, as the checkout or the cart read it from the database. */
export interface CouponLine {
  productId: string;
  vendorId: string | null;
  categoryId: string | null;
  price: number;
  quantity: number;
}

export interface CouponOutcome {
  coupon: any;
  /** What the code is allowed to touch — a vendor code rarely covers the whole cart. */
  eligibleSubtotal: number;
  discount: number;
}

/** Rounds money the way the rest of the API does. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The four states a code can be in, which is what both lists filter on. */
export function couponState(row: any, now: Date = new Date()): "live" | "upcoming" | "expired" | "stopped" {
  if (row.isActive === false) return "stopped";
  if (row.startDate && new Date(row.startDate) > now) return "upcoming";
  if (row.endDate && new Date(row.endDate) < now) return "expired";
  if (Number(row.totalUsageLimit) > 0 && Number(row.usedCount) >= Number(row.totalUsageLimit)) {
    return "expired";
  }
  return "live";
}

function toIdString(value: unknown): string {
  if (!value) return "";
  return typeof value === "object" && "_id" in (value as any)
    ? String((value as any)._id)
    : String(value);
}

/**
 * The words a populated reference carries, or "" when it was not populated.
 *
 * The staff list reads the shop and the named lines alongside the code, but the
 * checkout and the writes hand this same mapper a bare document. So a name is
 * always a maybe: the screen falls back to a count rather than showing nothing.
 */
function refWords(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
  }
  return "";
}

/** Titles of the named products, empty when they were not read alongside. */
function refsWords(list: unknown, keys: string[]): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((entry) => refWords(entry, keys)).filter(Boolean);
}

export function toCouponDto(row: any) {
  const now = new Date();
  const total = Number(row.totalUsageLimit) || 0;
  const used = Number(row.usedCount) || 0;

  // Whichever name the staff list managed to read: the shop's own name is the
  // one a support desk recognises, so it wins over the account behind it.
  const sellerName =
    refWords(row.storeId, ["name"]) || refWords(row.vendorId, ["name", "email"]);

  return {
    _id: String(row._id),
    code: row.code,
    title: row.title || "",
    description: row.description || "",
    ownerType: row.ownerType,
    vendorId: toIdString(row.vendorId) || null,
    storeId: toIdString(row.storeId) || null,
    discountType: row.discountType,
    discountValue: Number(row.discountValue) || 0,
    minOrderAmount: Number(row.minOrderAmount) || 0,
    maxDiscountAmount: Number(row.maxDiscountAmount) || 0,
    startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
    endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
    totalUsageLimit: total,
    perCustomerLimit: Number(row.perCustomerLimit) || 0,
    productIds: (row.productIds || []).map((id: unknown) => toIdString(id)).filter(Boolean),
    categoryIds: (row.categoryIds || []).map((id: unknown) => toIdString(id)).filter(Boolean),
    isActive: row.isActive !== false,
    usedCount: used,
    discountGiven: money(Number(row.discountGiven) || 0),
    /** 0 means unlimited, and the screen shows "No limit" rather than a zero. */
    remaining: total > 0 ? Math.max(total - used, 0) : 0,
    redemptionCount: (row.redemptions || []).length,
    state: couponState(row, now),
    /** "" on a store-wide code, and on any read that did not look the shop up. */
    sellerName,
    storeSlug: refWords(row.storeId, ["slug"]),
    productNames: refsWords(row.productIds, ["title"]),
    categoryNames: refsWords(row.categoryIds, ["name"]),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/**
 * Lists codes for one of the two desks.
 *
 * The vendor scope is passed in by the caller's own route, never read from the
 * query, so a seller asking for `owner=vendor` still only sees their own codes.
 *
 * Only the staff list looks the shop and the named lines up: a seller reading
 * their own codes already knows their shop, and their picker resolves the
 * titles from their own shelf.
 */
export async function listCoupons(query: CouponQuery, scope?: { vendorId: string }) {
  const { owner, status, search, page, limit } = query;
  const filter: Record<string, unknown> = {};

  if (scope?.vendorId) {
    filter.vendorId = new Types.ObjectId(scope.vendorId);
  } else if (owner === "admin") {
    filter.ownerType = "admin";
  } else if (owner === "vendor") {
    filter.ownerType = "vendor";
  }

  if (search?.trim()) {
    const match = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ code: match }, { title: match }, { description: match }];
  }

  const find = Coupon.find(filter).sort({ isActive: -1, startDate: -1 }).lean();
  const rows = scope?.vendorId
    ? await find
    : await find
        .populate("vendorId", "name email")
        .populate("storeId", "name slug")
        .populate("productIds", "title")
        .populate("categoryIds", "name");
  const all = rows.map((row) => toCouponDto(row));

  // `state` is a reading of dates and counters, not a stored flag, so the filter
  // runs after the map. The list is a desk's own codes, never a large set.
  const filtered = status === "all" ? all : all.filter((coupon) => coupon.state === status);

  const typeCounts = all.reduce<Record<string, number>>((counts, coupon) => {
    counts[coupon.state] = (counts[coupon.state] || 0) + 1;
    counts.all = (counts.all || 0) + 1;
    return counts;
  }, {});

  const total = filtered.length;
  const start = (page - 1) * limit;

  return {
    coupons: filtered.slice(start, start + limit),
    total,
    typeCounts,
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

/** The code nobody may overwrite: one document, one meaning. */
async function assertCodeIsFree(code: string, exceptId?: string) {
  const clash = await Coupon.findOne({
    code: code.toUpperCase(),
    ...(exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {}),
  }).lean();
  if (clash) {
    throw new ApiError(409, `The code ${code.toUpperCase()} is already taken`);
  }
}

export interface CouponOwner {
  ownerType: "admin" | "vendor";
  /** The seller's account id; null for the store team. */
  vendorId?: string | null;
  storeId?: string | null;
  createdBy?: string | null;
}

export async function createCoupon(input: CreateCouponInput, owner: CouponOwner) {
  await assertCodeIsFree(input.code);

  const row = await Coupon.create({
    ...input,
    code: input.code.toUpperCase(),
    ownerType: owner.ownerType,
    vendorId: owner.vendorId ? new Types.ObjectId(owner.vendorId) : null,
    storeId: owner.storeId ? new Types.ObjectId(owner.storeId) : null,
    createdBy: owner.createdBy ? new Types.ObjectId(owner.createdBy) : null,
    usedCount: 0,
    discountGiven: 0,
    redemptions: [],
  });

  return toCouponDto(row.toObject());
}

/** One read that fails with the right code: 404 for "not yours", never 403. */
export async function requireCoupon(id: string, vendorId?: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Coupon not found");

  const row = await Coupon.findOne({
    _id: new Types.ObjectId(id),
    ...(vendorId ? { vendorId: new Types.ObjectId(vendorId) } : {}),
  });
  if (!row) throw new ApiError(404, "Coupon not found");
  return row;
}

/**
 * The read a write starts from.
 *
 * With a vendor id it stays inside that seller's codes — a foreign id answers
 * 404, never 403. Without one this is the staff desk, and the staff desk only
 * writes the store's own codes: a seller's code is theirs to manage, because
 * reawakening one from here would skip the plan check that stops a suspended
 * shop from running a code it no longer has a slot for.
 */
async function loadForWrite(id: string, vendorId?: string) {
  const row = await requireCoupon(id, vendorId);

  if (!vendorId && row.ownerType !== "admin") {
    throw new ApiError(
      400,
      `"${row.code}" is a seller's code. They stop or renew it from their own coupons desk`
    );
  }

  return row;
}

export async function updateCoupon(
  id: string,
  input: UpdateCouponInput,
  vendorId?: string
) {
  const row = await loadForWrite(id, vendorId);

  if (input.code && input.code.toUpperCase() !== row.code) {
    await assertCodeIsFree(input.code, String(row._id));
    row.code = input.code.toUpperCase();
  }

  const patch: Record<string, unknown> = { ...input };
  delete patch.code;
  Object.assign(row, patch);

  await row.save();
  return toCouponDto(row.toObject());
}

/**
 * Stops a code instead of deleting it.
 *
 * Orders keep quoting the code they were bought with, and the ledger of who used
 * what is the answer to "why is this much gone". A stopped row is out of the
 * seller's plan usage and off the checkout, but it is never rewritten.
 */
export async function stopCoupon(id: string, vendorId?: string, mode: "inactive" | "delete" = "inactive") {
  const row = await loadForWrite(id, vendorId);

  if (mode === "delete" && Number(row.usedCount) > 0) {
    // A code that has already saved somebody money stays: the redemption ledger
    // and the orders that quote it are worth more than an empty list.
    row.isActive = false;
    await row.save();
    return { stopped: true, deleted: false, coupon: toCouponDto(row.toObject()) };
  }

  if (mode === "delete") {
    await Coupon.deleteOne({ _id: row._id });
    return { stopped: true, deleted: true, coupon: toCouponDto(row.toObject()) };
  }

  row.isActive = false;
  await row.save();
  return { stopped: true, deleted: false, coupon: toCouponDto(row.toObject()) };
}

/**
 * Turns the buyer's product ids into priced lines.
 *
 * Prices, sellers and categories all come from the database here, so the same
 * helper answers the cart's "does this work?" and settles the order's total.
 */
export async function loadCouponLines(items: { productId: string; quantity: number }[]): Promise<CouponLine[]> {
  const ids = items.map((item) => item.productId);
  const rows = await Product.find({ _id: { $in: ids } })
    .select("_id price vendorId categoryId ownerId")
    .lean();

  const byId = new Map(rows.map((row) => [String(row._id), row]));

  return items
    .map((item) => {
      const product = byId.get(String(item.productId));
      if (!product) return null;
      return {
        productId: String(product._id),
        vendorId: product.vendorId ? String(product.vendorId) : null,
        categoryId: product.categoryId ? String(product.categoryId) : null,
        price: Number(product.price) || 0,
        quantity: Number(item.quantity) || 0,
      } satisfies CouponLine;
    })
    .filter((line): line is CouponLine => line !== null);
}

/** Does this line fall inside the code's own narrowing? Empty lists mean "anything the owner may discount". */
function lineMatchesScope(line: CouponLine, coupon: any) {
  const productIds = (coupon.productIds || []).map((id: unknown) => toIdString(id));
  const categoryIds = (coupon.categoryIds || []).map((id: unknown) => toIdString(id));

  if (productIds.length === 0 && categoryIds.length === 0) return true;
  if (productIds.length > 0 && productIds.includes(line.productId)) return true;
  if (categoryIds.length > 0 && line.categoryId && categoryIds.includes(line.categoryId)) return true;
  return false;
}

/**
 * Works out what a code is worth on this basket, or why it is worth nothing.
 *
 * Every refusal carries the reason the shopper should see — not "invalid code"
 * for a code that is real but starts tomorrow, which would send them typing it
 * again. The thrown messages are the same ones the checkout writes into the
 * order, so the failure the customer read is the failure on record.
 */
export async function evaluateCoupon(input: {
  code: string;
  userId: string;
  lines: CouponLine[];
}): Promise<CouponOutcome> {
  const { code, userId, lines } = input;
  const now = new Date();

  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() }).lean();
  if (!coupon) throw new ApiError(400, "Invalid or expired coupon code");
  if (coupon.isActive === false) throw new ApiError(400, "This code is no longer active");

  if (coupon.startDate && new Date(coupon.startDate) > now) {
    throw new ApiError(400, "This code is not active yet");
  }
  if (coupon.endDate && new Date(coupon.endDate) < now) {
    throw new ApiError(400, "This code has expired");
  }

  const limit = Number(coupon.totalUsageLimit) || 0;
  if (limit > 0 && Number(coupon.usedCount) >= limit) {
    throw new ApiError(400, "This code has already been used up");
  }

  const perCustomer = Number(coupon.perCustomerLimit) || 0;
  if (perCustomer > 0) {
    const mine = (coupon.redemptions || []).filter(
      (entry: any) => toIdString(entry.customerId) === userId && !entry.reversedAt
    ).length;
    if (mine >= perCustomer) {
      throw new ApiError(400, "You have already used this code as many times as allowed");
    }
  }

  // A vendor's code never reaches across the marketplace: only their own lines
  // count, even when the basket also holds the platform's stock or another
  // shop's products.
  const ownerId = coupon.ownerType === "vendor" ? toIdString(coupon.vendorId) : "";
  const eligible = lines.filter(
    (line) => (!ownerId || line.vendorId === ownerId) && lineMatchesScope(line, coupon)
  );
  const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.price * line.quantity, 0);

  if (eligible.length === 0) {
    throw new ApiError(400, "This code does not apply to anything in your cart");
  }

  const minimum = Number(coupon.minOrderAmount) || 0;
  if (eligibleSubtotal < minimum) {
    throw new ApiError(
      400,
      `Spend at least ${minimum} on the items this code covers to use it`
    );
  }

  const value = Number(coupon.discountValue) || 0;
  let discount =
    coupon.discountType === "percentage" ? (eligibleSubtotal * value) / 100 : value;

  if (coupon.discountType === "percentage") {
    const cap = Number(coupon.maxDiscountAmount) || 0;
    if (cap > 0) discount = Math.min(discount, cap);
  }

  discount = money(Math.min(discount, eligibleSubtotal));
  if (discount <= 0) throw new ApiError(400, "This code does not apply to anything in your cart");

  return { coupon, eligibleSubtotal: money(eligibleSubtotal), discount };
}

/** Convenience for the cart and the checkout: lines straight from product ids. */
export async function validateCouponForUser(input: {
  code: string;
  userId: string;
  items: { productId: string; quantity: number }[];
}) {
  const lines = await loadCouponLines(input.items);
  const outcome = await evaluateCoupon({ code: input.code, userId: input.userId, lines });

  return {
    ...toCouponDto(outcome.coupon),
    eligibleSubtotal: outcome.eligibleSubtotal,
    discount: outcome.discount,
  };
}

/**
 * Books one use of the code, inside the order's transaction.
 *
 * The counter and the ledger move with the order: an order that rolls back never
 * spends a redemption, and a redemption can always be traced to the order that
 * caused it — which is what makes the reversal on cancellation exact.
 */
export async function redeemCoupon(
  couponId: unknown,
  params: { orderId: string; customerId: string; amount: number },
  session?: ClientSession
) {
  await Coupon.updateOne(
    { _id: new Types.ObjectId(String(couponId)) },
    {
      $inc: { usedCount: 1, discountGiven: params.amount },
      $push: {
        redemptions: {
          orderId: new Types.ObjectId(params.orderId),
          customerId: new Types.ObjectId(params.customerId),
          amount: params.amount,
          at: new Date(),
          reversedAt: null,
        },
      },
    },
    { session: session ?? undefined }
  );
}

/**
 * Hands a redemption back when the order is cancelled.
 *
 * Only the entry that is not already reversed is touched, and the counters only
 * move once, so a cancellation that is replayed (or a return followed by another
 * admin write) cannot credit the code twice.
 */
export async function releaseCouponForOrder(
  order: { _id?: unknown; couponId?: unknown; couponDiscount?: number; userId?: unknown },
  session?: ClientSession
) {
  const couponId = order.couponId;
  if (!couponId) return false;

  const result = await Coupon.updateOne(
    {
      _id: new Types.ObjectId(String(couponId)),
      "redemptions.orderId": new Types.ObjectId(String(order._id)),
      "redemptions.reversedAt": null,
    },
    {
      $inc: {
        usedCount: -1,
        discountGiven: -(Number(order.couponDiscount) || 0),
      },
      $set: { "redemptions.$[entry].reversedAt": new Date() },
    },
    {
      arrayFilters: [{ "entry.orderId": new Types.ObjectId(String(order._id)) }],
      session: session ?? undefined,
    }
  );

  return result.modifiedCount > 0;
}
