/**
 * Types and the one central plan table for the marketplace add-on.
 *
 * Every limit the store sells lives here. The services read the table, the
 * dashboards render it, and nothing else in the codebase is allowed to invent
 * a plan number — otherwise a "10 products" rule would exist twice and drift.
 */

/** Application lifecycle, exactly as the review screen names it. */
export const VENDOR_APPLICATION_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type VendorApplicationStatus = (typeof VENDOR_APPLICATION_STATUSES)[number];

/** The account-level mirror of the application, carried on the user row. */
export const VENDOR_ACCOUNT_STATES = [
  "none",
  "pending",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type VendorAccountState = (typeof VENDOR_ACCOUNT_STATES)[number];

/** A pending or in-review applicant holds no access at all. */
export const BLOCKING_APPLICATION_STATUSES: VendorApplicationStatus[] = [
  "pending",
  "under_review",
];

export const isBlockingApplicationStatus = (status?: string | null): boolean =>
  BLOCKING_APPLICATION_STATUSES.includes((status || "") as VendorApplicationStatus);

/** The store's own lifecycle, separate from the application. */
export const VENDOR_STORE_STATUSES = ["active", "suspended", "closed"] as const;
export type VendorStoreStatus = (typeof VENDOR_STORE_STATUSES)[number];

/** What a vendor may set on a product they own. */
export const VENDOR_PRODUCT_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
  "out_of_stock",
] as const;
export type VendorProductStatus = (typeof VENDOR_PRODUCT_STATUSES)[number];

/** Paid plans are the only ones that go through the demo checkout. */
export const VENDOR_PLAN_IDS = ["free", "premium", "advanced"] as const;
export type VendorPlanId = (typeof VENDOR_PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Ordered worst-to-best so an upgrade/downgrade is a comparison, not a list. */
export const PLAN_RANK: Record<VendorPlanId, number> = {
  free: 0,
  premium: 1,
  advanced: 2,
};

export interface VendorPlanLimits {
  /** Active (published) products the plan allows. */
  maxProducts: number;
  /** Products the vendor may pin as featured at the same time. */
  featuredProducts: number;
  /** How long one featured placement runs, in days. */
  featuredDurationDays: number;
  /** Coupons that may be active at the same time. */
  activeCoupons: number;
  analytics: "basic" | "detailed" | "advanced";
  salesReports: "basic" | "advanced";
  exports: "limited" | "full";
  storeCustomization: "basic" | "enhanced" | "full";
  promotionalCampaigns: "none" | "limited" | "priority";
  storeVisibility: "standard" | "enhanced" | "priority";
  support: "standard" | "priority";
}

export interface VendorPlan extends VendorPlanLimits {
  id: VendorPlanId;
  name: string;
  /** Monthly price in the store currency (BDT). */
  monthlyPrice: number;
  /** Yearly price; the default gives two months free. */
  yearlyPrice: number;
  /** Short list the pricing cards show; the limits above stay authoritative. */
  highlights: string[];
  /** Admin can retire a plan without deleting it. */
  isActive: boolean;
}

/**
 * The defaults the store starts with. An admin edit is stored as a
 * `subscriptionplans` row and wins over this table; this is only the seed.
 */
export const DEFAULT_VENDOR_PLANS: Record<VendorPlanId, VendorPlan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    maxProducts: 10,
    featuredProducts: 0,
    featuredDurationDays: 0,
    activeCoupons: 2,
    analytics: "basic",
    salesReports: "basic",
    exports: "limited",
    storeCustomization: "basic",
    promotionalCampaigns: "none",
    storeVisibility: "standard",
    support: "standard",
    highlights: [
      "10 active products",
      "2 active coupons",
      "Basic store analytics",
      "Standard store visibility",
    ],
    isActive: true,
  },
  premium: {
    id: "premium",
    name: "Premium",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    maxProducts: 50,
    featuredProducts: 3,
    featuredDurationDays: 7,
    activeCoupons: 10,
    analytics: "detailed",
    salesReports: "advanced",
    exports: "full",
    storeCustomization: "enhanced",
    promotionalCampaigns: "limited",
    storeVisibility: "enhanced",
    support: "priority",
    highlights: [
      "50 active products",
      "3 featured products for 7 days",
      "10 active coupons",
      "Detailed analytics and CSV/PDF reports",
      "Enhanced storefront visibility",
      "Priority support",
    ],
    isActive: true,
  },
  advanced: {
    id: "advanced",
    name: "Advanced",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    maxProducts: 150,
    featuredProducts: 10,
    featuredDurationDays: 30,
    activeCoupons: 30,
    analytics: "advanced",
    salesReports: "advanced",
    exports: "full",
    storeCustomization: "full",
    promotionalCampaigns: "priority",
    storeVisibility: "priority",
    support: "priority",
    highlights: [
      "150 active products",
      "10 featured products for 30 days",
      "30 active coupons",
      "Advanced analytics and conversion reports",
      "Priority featured placement",
      "Full store customization",
      "Priority support",
    ],
    isActive: true,
  },
};

/** Price of one billing period for a plan. */
export function planPrice(plan: VendorPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

/** How many days a billing period covers. */
export function billingDays(cycle: BillingCycle): number {
  return cycle === "yearly" ? 365 : 30;
}

/** A free plan never reaches the demo checkout. */
export const isPaidPlan = (planId: VendorPlanId): boolean => planId !== "free";
