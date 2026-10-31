import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as storeService from "./vendor-store.service";
import { storeQuerySchema } from "./vendor-store.validator";

/**
 * The vendor's storefront, read and written through the signed-in account.
 *
 * There is no id in any of these routes on purpose: the service derives the
 * store from the token, so one vendor cannot name another vendor's shop. The
 * one exception is the store team's list, which is everyone's shops at once.
 */

export const getMyStore = catchAsync(async (req, res) => {
  const store = await storeService.getMyStore(req.user!.id);
  apiResponse(res, 200, store, "Store fetched successfully");
});

export const updateMyStore = catchAsync(async (req, res) => {
  const store = await storeService.updateMyStore(req.user!.id, req.body);
  apiResponse(res, 200, store, "Store updated");
});

export const getStores = catchAsync(async (req, res) => {
  const query = parseQuery(storeQuerySchema, req.query);
  const result = await storeService.listStores(query);
  apiResponse(res, 200, result, "Stores fetched successfully");
});
