import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { promotionQuerySchema } from "./featured-promotion.validator";
import * as promotionService from "./vendor-promotion.service";

/**
 * The seller's placements, always scoped to the signed-in account.
 *
 * No route takes a vendor id and none takes a length in days: the account
 * supplies the owner and the plan supplies the window, so a request cannot book
 * a decade of shelf space or lift another shop's product.
 */

export const listMyPromotions = catchAsync(async (req, res) => {
  const query = parseQuery(promotionQuerySchema, req.query);
  const result = await promotionService.listMyPromotions(req.user!.id, query);
  apiResponse(res, 200, result, "Promotions fetched successfully");
});

export const featureMyProduct = catchAsync(async (req, res) => {
  const promotion = await promotionService.featureMyProduct(req.user!.id, req.body);
  apiResponse(res, 201, promotion, "Product is now featured");
});

/** Frees the slot early. The row stays, so the desk can still explain it. */
export const cancelMyPromotion = catchAsync(async (req, res) => {
  const promotion = await promotionService.cancelMyPromotion(
    req.user!.id,
    req.params.id as string
  );
  apiResponse(res, 200, promotion, "Placement ended");
});
