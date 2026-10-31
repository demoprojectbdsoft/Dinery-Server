import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { ApiError } from "../../utils/apiError";
import * as storeService from "./vendor-store.service";
import { publicStoreQuerySchema, storeQuerySchema, storeSlugParamSchema } from "./vendor-store.validator";

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

// ─── Public ──────────────────────────────────────────────────────────────────
// Both reads answer 404 for a shop the public is not allowed to see, so a
// hidden, suspended or closed store looks exactly like one that never existed.

export const getPublicStores = catchAsync(async (req, res) => {
  const query = parseQuery(publicStoreQuerySchema, req.query);
  const result = await storeService.listPublicStores(query);
  apiResponse(res, 200, result, "Stores fetched successfully");
});

export const getPublicStore = catchAsync(async (req, res) => {
  // A malformed slug is read as "no such shop": the shape of the URL segment
  // is an implementation detail the public was never told about.
  const parsed = storeSlugParamSchema.safeParse(req.params);
  if (!parsed.success) throw new ApiError(404, "Store not found");
  const store = await storeService.getPublicStoreBySlug(parsed.data.slug);
  apiResponse(res, 200, store, "Store fetched successfully");
});
