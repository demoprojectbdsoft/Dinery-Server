import { Types } from "mongoose";
import { ApiError } from "../../utils/apiError";
import { Product } from "../product/product.model";
import * as couponService from "../coupon/coupon.service";
import type {
  CouponQuery,
  CreateCouponInput,
  UpdateCouponInput,
} from "../coupon/coupon.validator";
import { requireTradingStore } from "./vendor-store.service";
import { assertWithinLimit } from "./vendor-subscription.service";

/**
 * A seller's own discount codes.
 *
 * The document is the same one the store team writes, so all the arithmetic and
 * the whole redemption ledger stay in `coupon.service`. This file only adds the
 * three things a vendor desk has to enforce: the code belongs to this seller, it
 * fits inside their plan's active-coupon allowance, and it can only name
 * products from their own shelf.
 *
 * A vendor code never reaches across the marketplace. Even if a basket holds
 * another shop's goods or the platform's own stock, the discount the checkout
 * computes is limited to this seller's lines.
 */

/**
 * A coupon may only point at the seller's own products.
 *
 * The checkout would ignore foreign lines anyway, but refusing here stops a
 * seller from saving a code that promises a discount it can never give.
 */
async function assertProductsAreOwn(userId: string, productIds: string[]) {
  if (!productIds || productIds.length === 0) return;

  const wanted = new Set(productIds);
  const found = await Product.countDocuments({
    _id: { $in: [...wanted].map((id) => new Types.ObjectId(id)) },
    $or: [{ vendorId: userId }, { ownerId: userId }],
  });

  if (found !== wanted.size) {
    throw new ApiError(400, "A coupon can only name products from your own store");
  }
}

export async function listMyCoupons(userId: string, query: CouponQuery) {
  return couponService.listCoupons(query, { vendorId: userId });
}

export async function getMyCoupon(userId: string, id: string) {
  const row = await couponService.requireCoupon(id, userId);
  return couponService.toCouponDto(row.toObject());
}

export async function createMyCoupon(userId: string, input: CreateCouponInput) {
  const store = await requireTradingStore(userId, "running coupons");
  await assertProductsAreOwn(userId, input.productIds);
  await assertWithinLimit(userId, "coupon");

  return couponService.createCoupon(input, {
    ownerType: "vendor",
    vendorId: userId,
    storeId: String(store._id),
    createdBy: userId,
  });
}

/**
 * Editing a code can cost a slot.
 *
 * Waking a stopped coupon is the same act as writing a new one as far as the
 * plan is concerned, so it is checked against the same allowance.
 */
export async function updateMyCoupon(userId: string, id: string, input: UpdateCouponInput) {
  const row = await couponService.requireCoupon(id, userId);

  if (input.productIds) {
    await assertProductsAreOwn(userId, input.productIds);
  }

  const reactivating = input.isActive === true && row.isActive !== true;
  if (reactivating) {
    await assertWithinLimit(userId, "coupon");
  }

  return couponService.updateCoupon(id, input, userId);
}

export async function deleteMyCoupon(userId: string, id: string) {
  return couponService.stopCoupon(id, userId, "delete");
}
