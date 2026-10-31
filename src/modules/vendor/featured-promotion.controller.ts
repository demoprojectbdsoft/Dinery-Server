import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { promotionQuerySchema } from "./featured-promotion.validator";
import * as promotionService from "./featured-promotion.service";

/**
 * The store team's promotions board.
 *
 * A grant here is the one way a shop gets lifted as a featured store, and the
 * one way a product is featured without the seller spending a plan slot. Both
 * still run out on a date, because a favour is not a permanent shelf.
 */

export const getPromotions = catchAsync(async (req, res) => {
  const query = parseQuery(promotionQuerySchema, req.query);
  const result = await promotionService.listPromotions(
    query,
    query.vendorId ? { vendorId: query.vendorId } : undefined
  );
  apiResponse(res, 200, result, "Promotions fetched successfully");
});

export const grantPromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.grantByAdmin(req.body);
  apiResponse(res, 201, promotion, "Placement granted");
});

/** Ends one placement with the reason the seller will read. */
export const revokePromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.revokeByAdmin(
    req.params.id as string,
    (req.body?.reason as string) || "Ended by the store team"
  );
  apiResponse(res, 200, promotion, "Placement ended");
});

/**
 * Closes every placement whose date has passed and dims what it lifted.
 *
 * Vercel Cron calls this once a day, because a serverless host has no process
 * that could keep an in-house scheduler alive; an admin can run the same sweep
 * by hand from this route.
 */
export const expirePromotions = catchAsync(async (_req, res) => {
  const result = await promotionService.expireDuePromotions();
  apiResponse(res, 200, result, "Lapsed placements expired");
});
