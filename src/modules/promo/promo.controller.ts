import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import * as promoService from "./promo.service";

export const createPromo = catchAsync(async (req, res) => {
  const promo = await promoService.createPromo(req.body);
  apiResponse(res, 201, promo, "Promo banner created");
});

export const getPromos = catchAsync(async (req, res) => {
  const isActive =
    req.query.isActive === "true" ? true :
    req.query.isActive === "false" ? false :
    undefined;

  // Only the two placements the storefront knows are accepted.
  const placement =
    req.query.placement === "tile" || req.query.placement === "strip"
      ? req.query.placement
      : undefined;

  const promos = await promoService.getPromos({ isActive, placement });
  apiResponse(res, 200, promos);
});

export const updatePromo = catchAsync(async (req, res) => {
  const promo = await promoService.updatePromo(req.params.id as string, req.body);
  apiResponse(res, 200, promo, "Promo banner updated");
});

export const deletePromo = catchAsync(async (req, res) => {
  await promoService.deletePromo(req.params.id as string);
  apiResponse(res, 200, null, "Promo banner deleted");
});
