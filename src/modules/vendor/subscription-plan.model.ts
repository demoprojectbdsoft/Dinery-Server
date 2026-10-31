import { Schema, model } from "mongoose";
import { VENDOR_PLAN_IDS } from "./vendor.types";

/**
 * An admin-editable copy of one plan.
 *
 * The defaults in `vendor.types.ts` seed this collection; from then on a row
 * here wins. That is how "prices, limits, features and billing duration must be
 * editable by Admin" holds without touching code, while a missing row still
 * leaves the store working.
 */
const subscriptionPlanSchema = new Schema(
  {
    planId: { type: String, enum: VENDOR_PLAN_IDS, required: true, unique: true, index: true },
    name: { type: String, required: true },

    monthlyPrice: { type: Number, required: true, min: 0 },
    yearlyPrice: { type: Number, required: true, min: 0 },

    maxProducts: { type: Number, required: true, min: 0 },
    featuredProducts: { type: Number, required: true, min: 0 },
    featuredDurationDays: { type: Number, required: true, min: 0 },
    activeCoupons: { type: Number, required: true, min: 0 },

    analytics: { type: String, enum: ["basic", "detailed", "advanced"], required: true },
    salesReports: { type: String, enum: ["basic", "advanced"], required: true },
    exports: { type: String, enum: ["limited", "full"], required: true },
    storeCustomization: { type: String, enum: ["basic", "enhanced", "full"], required: true },
    promotionalCampaigns: { type: String, enum: ["none", "limited", "priority"], required: true },
    storeVisibility: { type: String, enum: ["standard", "enhanced", "priority"], required: true },
    support: { type: String, enum: ["standard", "priority"], required: true },

    highlights: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },

    /** Platform commission on this plan, in percent. */
    commissionPercent: { type: Number, default: 0, min: 0, max: 100 },
    /** Days a lapsed subscription keeps its benefits before it stops. */
    gracePeriodDays: { type: Number, default: 0, min: 0 },
    /** Billing periods the plan may be bought for. */
    billingCycles: { type: [String], enum: ["monthly", "yearly"], default: ["monthly", "yearly"] },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const SubscriptionPlan = model("SubscriptionPlan", subscriptionPlanSchema);
