import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import * as storeService from "./vendor-store.service";

/**
 * The vendor's storefront, read and written through the signed-in account.
 *
 * There is no id in any of these routes on purpose: the service derives the
 * store from the token, so one vendor cannot name another vendor's shop.
 */

export const getMyStore = catchAsync(async (req, res) => {
  const store = await storeService.getMyStore(req.user!.id);
  apiResponse(res, 200, store, "Store fetched successfully");
});

export const updateMyStore = catchAsync(async (req, res) => {
  const store = await storeService.updateMyStore(req.user!.id, req.body);
  apiResponse(res, 200, store, "Store updated");
});
