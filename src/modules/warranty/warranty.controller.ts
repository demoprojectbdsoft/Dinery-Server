import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import * as warrantyService from "./warranty.service";
import {
  submitWarrantyClaimSchema,
  adminUpdateClaimSchema,
  getWarrantiesQuerySchema,
} from "./warranty.validator";

/**
 * Customer: submit a claim for one of their own warranties.
 * The caller's identity is taken from the auth token, never the request body.
 */
export const submitClaim = catchAsync(async (req, res, next) => {
  if (!req.user?.id) {
    return next(new ApiError(401, "Authentication required"));
  }
  const parsed = submitWarrantyClaimSchema.safeParse({
    ...req.body,
    warrantyId: req.params.id,
  });
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }
  const warranty = await warrantyService.submitClaim(
    req.params.id as string,
    parsed.data,
    req.user.id
  );
  apiResponse(res, 200, warranty, "Warranty claim submitted");
});

/**
 * Customer: list their own warranties.
 */
export const getMyWarranties = catchAsync(async (req, res, next) => {
  if (!req.user?.id) {
    return next(new ApiError(401, "Authentication required"));
  }
  const parsed = getWarrantiesQuerySchema.safeParse({
    ...req.query,
    userId: req.user.id,
  });
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }
  const result = await warrantyService.getWarranties(parsed.data);
  apiResponse(res, 200, result, "Warranties fetched successfully");
});

/**
 * Customer: fetch the warranty record for a single order item.
 * Used by the order history "Claim" button to open the warranty detail modal.
 * Returns null when no warranty exists for this (user, order, product) triple.
 */
export const getWarrantyForOrderItem = catchAsync(async (req, res, next) => {
  if (!req.user?.id) {
    return next(new ApiError(401, "Authentication required"));
  }
  const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
  const productId = Array.isArray(req.params?.productId) ? req.params?.productId[0] : req.params?.productId;
  const warranty = await warrantyService.getWarrantyForOrderItem(
    orderId,
    productId,
    req.user.id
  );
  apiResponse(res, 200, warranty, "Warranty fetched successfully");
});

/**
 * Admin: list all warranties (optionally filtered).
 */
export const getAllWarranties = catchAsync(async (req, res, next) => {
  const parsed = getWarrantiesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }
  const result = await warrantyService.getWarranties(parsed.data);
  apiResponse(res, 200, result, "Warranties fetched successfully");
});

/**
 * Admin: process a claim — mark under review, request info, resolve, or reject.
 */
export const adminUpdateClaim = catchAsync(async (req, res, next) => {
  const parsed = adminUpdateClaimSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }
  const warranty = await warrantyService.adminUpdateClaim(
    req.params.id as string,
    parsed.data
  );
  apiResponse(res, 200, warranty, "Claim updated");
});