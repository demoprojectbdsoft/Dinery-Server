import { ApiError } from "../../utils/apiError";
import { SubscriptionPlan } from "./subscription-plan.model";
import {
  DEFAULT_VENDOR_PLANS,
  VENDOR_PLAN_IDS,
  type VendorPlan,
  type VendorPlanId,
} from "./vendor.types";

/**
 * The single place a plan is read from.
 *
 * The defaults in `vendor.types.ts` are the seed; a `subscriptionplans` row is
 * the admin's edit and wins. Everything — the pricing cards, the limit checks,
 * the expiry sweep — goes through here, so a changed price can never disagree
 * with a changed limit.
 */

/** Turns one stored row into the shape the rest of the app uses. */
function fromRow(row: any): VendorPlan {
  const fallback = DEFAULT_VENDOR_PLANS[row.planId as VendorPlanId];
  return {
    ...fallback,
    name: row.name ?? fallback.name,
    monthlyPrice: row.monthlyPrice ?? fallback.monthlyPrice,
    yearlyPrice: row.yearlyPrice ?? fallback.yearlyPrice,
    maxProducts: row.maxProducts ?? fallback.maxProducts,
    featuredProducts: row.featuredProducts ?? fallback.featuredProducts,
    featuredDurationDays: row.featuredDurationDays ?? fallback.featuredDurationDays,
    activeCoupons: row.activeCoupons ?? fallback.activeCoupons,
    analytics: row.analytics ?? fallback.analytics,
    salesReports: row.salesReports ?? fallback.salesReports,
    exports: row.exports ?? fallback.exports,
    storeCustomization: row.storeCustomization ?? fallback.storeCustomization,
    promotionalCampaigns: row.promotionalCampaigns ?? fallback.promotionalCampaigns,
    storeVisibility: row.storeVisibility ?? fallback.storeVisibility,
    support: row.support ?? fallback.support,
    highlights: row.highlights?.length ? row.highlights : fallback.highlights,
    isActive: row.isActive ?? fallback.isActive,
  };
}

/**
 * Writes any missing default plan into the collection.
 *
 * It uses upserts instead of a separate seed script so a fresh database works
 * on the first request, and an admin's edit is never overwritten.
 */
export async function ensurePlansSeeded(): Promise<void> {
  await Promise.all(
    VENDOR_PLAN_IDS.map((planId) =>
      SubscriptionPlan.updateOne(
        { planId },
        { $setOnInsert: DEFAULT_VENDOR_PLANS[planId] },
        { upsert: true }
      ).catch(() => undefined)
    )
  );
}

/** All three plans in their fixed order, merged with admin edits. */
export async function listPlans(): Promise<VendorPlan[]> {
  await ensurePlansSeeded();
  const rows = await SubscriptionPlan.find({}).lean();
  const byId = new Map(rows.map((row: any) => [row.planId, row]));

  return VENDOR_PLAN_IDS.map((planId) => {
    const row = byId.get(planId);
    return row ? fromRow(row) : DEFAULT_VENDOR_PLANS[planId];
  });
}

/** One plan, or a 400 naming the value that was sent. */
export async function getPlan(planId: string): Promise<VendorPlan> {
  if (!VENDOR_PLAN_IDS.includes(planId as VendorPlanId)) {
    throw new ApiError(400, "Unknown subscription plan");
  }

  const plans = await listPlans();
  const plan = plans.find((row) => row.id === planId);
  if (!plan) throw new ApiError(400, "Unknown subscription plan");
  return plan;
}

/**
 * An admin edit. Only the fields sent are written, and a plan can be retired
 * (`isActive: false`) without deleting the vendors already on it.
 */
export async function updatePlan(
  planId: string,
  patch: Partial<VendorPlan> & {
    commissionPercent?: number;
    gracePeriodDays?: number;
    billingCycles?: string[];
  },
  adminId?: string
): Promise<VendorPlan> {
  await getPlan(planId);

  const allowed: Record<string, unknown> = {};
  const fields = [
    "name",
    "monthlyPrice",
    "yearlyPrice",
    "maxProducts",
    "featuredProducts",
    "featuredDurationDays",
    "activeCoupons",
    "analytics",
    "salesReports",
    "exports",
    "storeCustomization",
    "promotionalCampaigns",
    "storeVisibility",
    "support",
    "highlights",
    "isActive",
    "commissionPercent",
    "gracePeriodDays",
    "billingCycles",
  ] as const;

  for (const field of fields) {
    if (patch[field] !== undefined) allowed[field] = patch[field];
  }

  if (Object.keys(allowed).length === 0) {
    throw new ApiError(400, "Nothing to update");
  }

  allowed.updatedBy = adminId ?? null;

  // The enum in the schema is narrower than "string", so the filter is cast the
  // same way the rest of the codebase casts ids that arrive from a URL.
  await SubscriptionPlan.updateOne({ planId } as any, { $set: allowed }, { upsert: true });
  return getPlan(planId);
}

/**
 * The commission that applies to a plan, in percent.
 *
 * It is read from the plan row, so changing the rate changes future sales only:
 * each delivered line stores the rate it was sold under.
 */
export async function commissionForPlan(planId: string): Promise<number> {
  await ensurePlansSeeded();
  const row: any = await SubscriptionPlan.findOne({ planId } as any)
    .select("commissionPercent")
    .lean();
  return Number(row?.commissionPercent) || 0;
}
