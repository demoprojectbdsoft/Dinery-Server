import { Types } from "mongoose";
import { ApiError } from "../../utils/apiError";
import { Product } from "../product/product.model";
import { VendorStore } from "./vendor-store.model";
import { VendorSubscription } from "./vendor-subscription.model";
import { FeaturedPromotion, type PromotionKind } from "./featured-promotion.model";
import { notifyVendorPromotion } from "./vendor.notifications";
import type { VendorPlanId } from "./vendor.types";
import type { GrantPromotionInput } from "./featured-promotion.validator";

/**
 * Featured placements — the one writer of "this is featured".
 *
 * A placement is a dated row: who paid for it (a plan or the store team), what
 * it lifts (one product, or the whole shop) and until when. `Product.isFeatured`
 * and `VendorStore.isFeatured` are only the display switches that this file
 * flips, so a placement that ends can never leave a product shining on the
 * shelves because nobody remembered to turn it off.
 *
 * The state a screen shows is read from the row's status *and* its clock: a host
 * without a running process may not have swept yet, and a placement that has run
 * past `endsAt` is over the moment it does, whoever looks.
 */

/** Who is behind this placement, once the plan check has already been made. */
export interface PromotionActor {
  vendorId: string;
  storeId: string;
  plan: VendorPlanId;
  /** "subscription" was bought by the seller; "admin" was given by the store team. */
  source: "subscription" | "admin";
  subscriptionId?: string | null;
}

export interface PromotionListQuery {
  status: "all" | "live" | "ended" | "cancelled";
  kind: "all" | PromotionKind;
  page: number;
  limit: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Stops a typo in the admin desk from booking a decade of shelf space. */
const MAX_PROMOTION_DAYS = 365;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysLeft(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS));
}

/** A placement is only truly running while its row is active and its clock is. */
function isLive(row: { status: string; endsAt: Date }, now: Date): boolean {
  return row.status === "active" && row.endsAt.getTime() > now.getTime();
}

type PopulatedProduct = {
  _id?: unknown;
  title?: string;
  image?: string;
  price?: number;
  vendorProductStatus?: string;
  isFeatured?: boolean;
};

type PopulatedStore = { _id?: unknown; name?: string; slug?: string; logo?: string };
type PopulatedUser = { _id?: unknown; name?: string };

/** Enough of the shop and its owner for a board that lists everyone's rows. */
const POPULATE_PRODUCT = "title image price vendorProductStatus isFeatured";
const POPULATE_STORE = "name slug logo";
const POPULATE_VENDOR = "name";

/** What every desk and screen is handed for one placement. */
export interface PromotionDto {
  _id: string;
  kind: PromotionKind;
  /** The stored row: a sweep has not necessarily run yet. */
  status: string;
  /** The same row read against the clock, which is what a screen should show. */
  state: "live" | "ended" | "cancelled";
  source: "subscription" | "admin";
  plan: string;
  vendorId: string | null;
  storeId: string | null;
  subscriptionId: string | null;
  productId: string | null;
  product: {
    _id: string;
    title: string;
    image: string;
    price: number;
    vendorProductStatus: string;
    isFeatured: boolean;
  } | null;
  /** The shop the placement lifts, named so a board of everyone's rows reads. */
  store: { _id: string; name: string; slug: string; logo: string } | null;
  vendorName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  endedAt: Date | null;
  endedReason: string;
  daysRemaining: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** The shape every screen reads. Money, ownership and dates come from the row. */
export function toPromotionDto(row: any): PromotionDto {
  const now = new Date();
  const live = isLive(row, now);
  const product = (row.productId && typeof row.productId === "object"
    ? (row.productId as PopulatedProduct)
    : null) as PopulatedProduct | null;
  const populatedStore = (row.storeId && typeof row.storeId === "object"
    ? (row.storeId as PopulatedStore)
    : null) as PopulatedStore | null;
  const populatedVendor = (row.vendorId && typeof row.vendorId === "object"
    ? (row.vendorId as PopulatedUser)
    : null) as PopulatedUser | null;

  let state: "live" | "ended" | "cancelled" = "ended";
  if (row.status === "cancelled") state = "cancelled";
  else if (live) state = "live";

  return {
    _id: String(row._id),
    kind: row.kind,
    status: row.status,
    state,
    source: row.source,
    plan: row.plan,
    vendorId: row.vendorId ? String(row.vendorId) : null,
    storeId: row.storeId ? String(row.storeId) : null,
    subscriptionId: row.subscriptionId ? String(row.subscriptionId) : null,
    productId: row.productId
      ? String(typeof row.productId === "object" ? (row.productId as any)._id ?? row.productId : row.productId)
      : null,
    /** Enough to draw the row without a second read per placement. */
    product: product
      ? {
          _id: String(product._id),
          title: product.title || "",
          image: product.image || "",
          price: Number(product.price) || 0,
          vendorProductStatus: product.vendorProductStatus || "",
          isFeatured: Boolean(product.isFeatured),
        }
      : null,
    /** Both are null / empty when the row was read without its joins. */
    store: populatedStore
      ? {
          _id: String(populatedStore._id),
          name: populatedStore.name || "",
          slug: populatedStore.slug || "",
          logo: populatedStore.logo || "",
        }
      : null,
    vendorName: populatedVendor?.name || "",
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    endedAt: row.endedAt ?? null,
    endedReason: row.endedReason || "",
    /** What the desk counts down, and what a seller sees before renewing. */
    daysRemaining: live ? daysLeft(row.endsAt, now) : 0,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

/** One placement with its product, its shop and its owner attached. */
async function readPromotion(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "No such promotion");

  const row = await FeaturedPromotion.findById(id)
    .populate("productId", POPULATE_PRODUCT)
    .populate("storeId", POPULATE_STORE)
    .populate("vendorId", POPULATE_VENDOR);
  if (!row) throw new ApiError(404, "No such promotion");
  return row;
}

/**
 * Turns the display switch on or off for whatever the placement lifted.
 *
 * This is the only place the flags are written from a placement, so the product
 * and the shop can never disagree with the row that paid for them.
 */
async function applyFeaturedFlag(
  row: { kind: PromotionKind; productId?: any; storeId?: any },
  on: boolean,
  endsAt?: Date | null
) {
  if (on && row.kind === "product") {
    await Product.updateOne({ _id: row.productId }, { $set: { isFeatured: true } });
    return;
  }

  if (on && row.kind === "store") {
    await VendorStore.updateOne(
      { _id: row.storeId },
      { $set: { isFeatured: true, featuredUntil: endsAt ?? null } }
    );
    return;
  }

  if (row.kind === "product") {
    await Product.updateOne({ _id: row.productId }, { $set: { isFeatured: false } });
    return;
  }

  await VendorStore.updateOne(
    { _id: row.storeId },
    { $set: { isFeatured: false, featuredUntil: null } }
  );
}

/** The message a second press gets: the shelf is already booked, and by how long. */
async function assertSlotIsFree(kind: PromotionKind, target: { productId?: string; vendorId?: string }) {
  const now = new Date();
  const clash = await FeaturedPromotion.findOne({
    kind,
    status: "active",
    endsAt: { $gt: now },
    ...(kind === "product" ? { productId: target.productId } : { vendorId: target.vendorId }),
  });

  if (clash) {
    throw new ApiError(
      409,
      kind === "product"
        ? `This product is already featured for ${daysLeft(clash.endsAt, now)} more day(s)`
        : `This store is already featured for ${daysLeft(clash.endsAt, now)} more day(s)`
    );
  }
}

/**
 * Books a placement and switches it on.
 *
 * Every limit question has been answered before this runs — the seller's desk
 * checks the plan, the admin desk checks nothing but its own role. The length
 * always comes from the caller, never from the browser.
 */
export async function createPromotion(
  input: { kind: PromotionKind; productId?: string; days: number },
  actor: PromotionActor
) {
  if (!Number.isFinite(input.days) || input.days <= 0) {
    throw new ApiError(400, "A featured placement needs a length in days");
  }
  if (input.days > MAX_PROMOTION_DAYS) {
    throw new ApiError(400, `A placement cannot run longer than ${MAX_PROMOTION_DAYS} days`);
  }

  if (input.kind === "product") {
    if (!input.productId) throw new ApiError(400, "Choose the product to feature");
    if (!Types.ObjectId.isValid(input.productId)) throw new ApiError(400, "Choose the product to feature");
    await assertSlotIsFree("product", { productId: input.productId });
  } else {
    if (input.productId) throw new ApiError(400, "A store placement does not take a product");
    await assertSlotIsFree("store", { vendorId: actor.vendorId });
  }

  const now = new Date();
  const created = await FeaturedPromotion.create({
    vendorId: new Types.ObjectId(actor.vendorId),
    storeId: new Types.ObjectId(actor.storeId),
    kind: input.kind,
    productId: input.kind === "product" ? new Types.ObjectId(input.productId!) : null,
    status: "active",
    subscriptionId: actor.subscriptionId ? new Types.ObjectId(actor.subscriptionId) : null,
    plan: actor.plan,
    source: actor.source,
    startsAt: now,
    endsAt: addDays(now, Math.min(input.days, MAX_PROMOTION_DAYS)),
  });

  await applyFeaturedFlag(created, true, created.endsAt);
  return toPromotionDto(await readPromotion(String(created._id)));
}

/** One vendor's placements, newest first. The store team may ask for everyone's. */
export async function listPromotions(query: PromotionListQuery, scope?: { vendorId?: string }) {
  const now = new Date();
  const filter: Record<string, unknown> = {};
  if (scope?.vendorId) filter.vendorId = new Types.ObjectId(scope.vendorId);
  if (query.kind !== "all") filter.kind = query.kind;

  if (query.status === "live") {
    filter.status = "active";
    filter.endsAt = { $gt: now };
  } else if (query.status === "ended") {
    filter.$or = [{ status: "expired" }, { status: "active", endsAt: { $lte: now } }];
  } else if (query.status === "cancelled") {
    filter.status = "cancelled";
  }

  const rows = await FeaturedPromotion.find(filter)
    .populate("productId", POPULATE_PRODUCT)
    .populate("storeId", POPULATE_STORE)
    .populate("vendorId", POPULATE_VENDOR)
    .sort({ startsAt: -1, createdAt: -1 })
    .lean();

  // The tabs count the same reading the rows use, so a "live" chip and the rows
  // beneath it cannot disagree while a sweep is still on its way.
  const dtos = rows.map(toPromotionDto);
  const stateCounts = dtos.reduce<Record<string, number>>((counts, row) => {
    counts[row.state as string] = (counts[row.state as string] || 0) + 1;
    counts.all = (counts.all || 0) + 1;
    return counts;
  }, {});

  const total = dtos.length;
  const start = (query.page - 1) * query.limit;

  return {
    promotions: dtos.slice(start, start + query.limit),
    total,
    stateCounts,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(Math.ceil(total / query.limit), 1),
    },
  };
}

/**
 * Closes one placement early.
 *
 * A foreign id answers 404 rather than confirming the row exists. Cancelling is
 * not a deletion: the row stays so the seller's desk can still say what ran, for
 * how long and why it stopped, and the slot it occupied is freed by the row no
 * longer being active.
 */
export async function endPromotion(id: string, reason: string, scope?: { vendorId?: string }) {
  const row = await readPromotion(id);
  if (scope?.vendorId && String(row.vendorId) !== String(scope.vendorId)) {
    throw new ApiError(404, "No such promotion");
  }

  if (row.status !== "active") {
    throw new ApiError(400, "This placement has already ended");
  }

  row.status = "cancelled";
  row.endedAt = new Date();
  row.endedReason = reason;
  await row.save();
  await applyFeaturedFlag(row, false);

  return toPromotionDto(await readPromotion(id));
}

/** The daily sweep: everything whose clock ran out stops being featured. */
export async function expireDuePromotions() {
  const now = new Date();
  const stale = await FeaturedPromotion.find({ status: "active", endsAt: { $lte: now } });

  for (const row of stale) {
    row.status = "expired";
    row.endedAt = now;
    row.endedReason = row.endedReason || "Featured period ended";
    await row.save();
    await applyFeaturedFlag(row, false);
  }

  return { expired: stale.length };
}

/**
 * Closes whatever placement is lifting one product.
 *
 * A listing the seller archived or unpublished cannot be bought, so the shelf it
 * was pinned to is given back instead of going on showing something nobody can
 * reach. Not a placement to end is a normal answer, so this is safe to call from
 * any status change.
 */
export async function endPlacementForProduct(productId: string, reason: string) {
  if (!Types.ObjectId.isValid(productId)) return { ended: 0 };

  const rows = await FeaturedPromotion.find({
    productId: new Types.ObjectId(productId),
    kind: "product",
    status: "active",
  });
  const now = new Date();

  for (const row of rows) {
    row.status = "cancelled";
    row.endedAt = now;
    row.endedReason = reason;
    await row.save();
    await applyFeaturedFlag(row, false);
  }

  return { ended: rows.length };
}

/**
 * Closes a vendor's whole board of placements, with a reason.
 *
 * Called when a subscription ends: the shop keeps its products, orders and
 * coupons, but nothing it bought with the expired plan stays on the shelves.
 */
export async function endPromotionsForVendor(vendorId: string, reason: string) {
  const rows = await FeaturedPromotion.find({ vendorId: new Types.ObjectId(vendorId), status: "active" });
  const now = new Date();

  for (const row of rows) {
    row.status = "expired";
    row.endedAt = now;
    row.endedReason = reason;
    await row.save();
    await applyFeaturedFlag(row, false);
  }

  return { ended: rows.length };
}

/**
 * The store team's own grant, outside any plan.
 *
 * A grant is still a dated placement, not a permanent flag: it runs for the days
 * the admin chose and then lapses through the same sweep, so a favour done last
 * quarter cannot still be lighting up a shelf nobody remembers. Who it belongs to
 * is read from the row being lifted, so no request can park a shop's goods on
 * someone else's shelf.
 */
export async function grantByAdmin(input: GrantPromotionInput) {
  if (input.kind === "product") {
    const product = await Product.findById(input.productId).lean();
    if (!product) throw new ApiError(404, "No such product");

    const vendorId = String((product as any).vendorId || (product as any).ownerId || "");
    if (!Types.ObjectId.isValid(vendorId)) {
      throw new ApiError(
        400,
        "This product belongs to the store itself. Feature it from the products desk."
      );
    }

    const store = await VendorStore.findOne({ userId: vendorId });
    if (!store) throw new ApiError(404, "That product's seller has no store on the marketplace");

    const created = await createPromotion(
      { kind: "product", productId: String(product._id), days: input.days },
      {
        vendorId,
        storeId: String((product as any).storeId || store._id),
        plan: await planFor(vendorId),
        source: "admin",
      }
    );

    await notifyVendorPromotion({
      userId: vendorId,
      title: `"${(product as any).title || "A product"}" is featured`,
      detail: input.reason
        ? `${input.days} days on the featured shelves — ${input.reason}`
        : `${input.days} days on the featured shelves, granted by the store team`,
      promotionId: String(created._id),
    });

    return created;
  }

  const vendorId = String(input.vendorId);
  const store = await VendorStore.findOne({ userId: vendorId });
  if (!store) throw new ApiError(404, "No store is linked to that seller");

  const created = await createPromotion(
    { kind: "store", days: input.days },
    {
      vendorId,
      storeId: String(store._id),
      plan: await planFor(vendorId),
      source: "admin",
    }
  );

  await notifyVendorPromotion({
    userId: vendorId,
    title: "Your store is featured",
    detail: input.reason
      ? `${input.days} days in the featured shops row — ${input.reason}`
      : `${input.days} days in the featured shops row, granted by the store team`,
    promotionId: String(created._id),
  });

  return created;
}

/**
 * Pulls a placement back before its date.
 *
 * The row survives with the reason written on it, so the seller can read why the
 * shelf went quiet instead of guessing.
 */
export async function revokeByAdmin(id: string, reason: string) {
  const row = await readPromotion(id);
  const closed = await endPromotion(id, reason);

  if (row.vendorId) {
    await notifyVendorPromotion({
      userId: String(row.vendorId),
      title: "A featured placement has ended",
      detail: `${reason} — ${closed.kind === "store" ? "the store" : `"${closed.product?.title || "the product"}"`} is no longer featured.`,
      promotionId: id,
    });
  }

  return closed;
}

/** The plan to write on an admin grant: the live one, or free when there is none. */
async function planFor(vendorId: string): Promise<VendorPlanId> {
  const live = await VendorSubscription.findOne({
    vendorId: new Types.ObjectId(vendorId),
    status: { $in: ["active", "grace"] },
  })
    .sort({ endDate: -1 })
    .select("plan")
    .lean();

  return (live?.plan as VendorPlanId) || "free";
}
