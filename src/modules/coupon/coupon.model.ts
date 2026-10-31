import { Schema, model } from "mongoose";

/**
 * One discount code, usable by the store team or by one vendor.
 *
 * The marketplace needs a single coupon system, not two: an admin's global
 * code and a vendor's own code live in this collection and are read by the
 * same checkout validator. `ownerType` says who wrote it and, together with
 * `vendorId`, is what the checkout uses to decide which items the discount may
 * touch.
 *
 * The code is stored upper-cased and the unique index is on that value, so
 * "save10" and "SAVE10" can never be two different coupons.
 */

export const COUPON_OWNER_TYPES = ["admin", "vendor"] as const;
export type CouponOwnerType = (typeof COUPON_OWNER_TYPES)[number];

export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

/** One line of the "who used what" ledger, kept beside the running totals. */
const couponRedemptionSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
    /** Set when the order is cancelled and the redemption is handed back. */
    reversedAt: { type: Date, default: null },
  },
  { _id: false }
);

const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, unique: true, index: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },

    ownerType: { type: String, enum: COUPON_OWNER_TYPES, required: true, index: true },
    /** The vendor who owns it. Empty for an admin coupon. */
    vendorId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    /** The store, so a vendor's coupons can be listed without a second query. */
    storeId: { type: Schema.Types.ObjectId, ref: "VendorStore", default: null },

    discountType: { type: String, enum: COUPON_DISCOUNT_TYPES, required: true },
    discountValue: { type: Number, required: true, min: 0 },

    minOrderAmount: { type: Number, default: 0, min: 0 },
    /** Caps a percentage coupon; 0 means "no cap". */
    maxDiscountAmount: { type: Number, default: 0, min: 0 },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    totalUsageLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    perCustomerLimit: { type: Number, default: 0, min: 0 }, // 0 = unlimited

    /** Empty means "every product this owner is allowed to discount". */
    productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    /** Empty means "every category". A product qualifies through either list. */
    categoryIds: [{ type: Schema.Types.ObjectId, ref: "Category" }],

    isActive: { type: Boolean, default: true, index: true },

    usedCount: { type: Number, default: 0 },
    /** Amount of discount actually granted, for the performance report. */
    discountGiven: { type: Number, default: 0 },
    redemptions: { type: [couponRedemptionSchema], default: [] },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// The vendor's coupon list: mine, newest first, optionally only the live ones.
couponSchema.index({ vendorId: 1, isActive: 1, createdAt: -1 });
// The checkout lookup and the expiry sweep.
couponSchema.index({ isActive: 1, endDate: 1 });

export const Coupon = model("Coupon", couponSchema);
