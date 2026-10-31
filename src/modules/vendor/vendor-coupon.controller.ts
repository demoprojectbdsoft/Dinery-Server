import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { couponQuerySchema } from "../coupon/coupon.validator";
import * as couponService from "./vendor-coupon.service";

/**
 * The seller's coupon desk, always scoped to the signed-in account.
 *
 * No route takes a vendor id: the token supplies it, so a seller can neither
 * read another shop's codes nor stop one they do not own.
 */

export const listMyCoupons = catchAsync(async (req, res) => {
  const query = parseQuery(couponQuerySchema, req.query);
  const result = await couponService.listMyCoupons(req.user!.id, query);
  apiResponse(res, 200, result, "Coupons fetched successfully");
});

export const getMyCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.getMyCoupon(req.user!.id, req.params.id as string);
  apiResponse(res, 200, coupon, "Coupon fetched successfully");
});

export const createMyCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.createMyCoupon(req.user!.id, req.body);
  apiResponse(res, 201, coupon, "Coupon created");
});

export const updateMyCoupon = catchAsync(async (req, res) => {
  const coupon = await couponService.updateMyCoupon(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  apiResponse(res, 200, coupon, "Coupon updated");
});

/**
 * A running code is stopped with PATCH `isActive: false`, so the only thing
 * DELETE adds is the chance to clear an unsaved draft. A code that has already
 * been spent is deactivated instead, because the orders still quote it.
 */
export const deleteMyCoupon = catchAsync(async (req, res) => {
  const result = await couponService.deleteMyCoupon(req.user!.id, req.params.id as string);
  apiResponse(res, 200, result, result.deleted ? "Coupon deleted" : "Coupon stopped");
});
