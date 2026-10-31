import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { vendorOrderQuerySchema } from "./vendor-order.validator";
import * as vendorOrderService from "./vendor-order.service";

/**
 * The seller's order board.
 *
 * The vendor id always comes from the token. There is no route here that can
 * name another seller or the parent order, so the shop can only ever see and
 * advance its own fulfilment groups.
 */

export const listMyOrders = catchAsync(async (req, res) => {
  const query = parseQuery(vendorOrderQuerySchema, req.query);
  const result = await vendorOrderService.listMyVendorOrders(req.user!.id, query);
  apiResponse(res, 200, result, "Orders fetched successfully");
});

export const getMyOrder = catchAsync(async (req, res) => {
  const order = await vendorOrderService.getMyVendorOrder(
    req.user!.id,
    req.params.id as string
  );
  apiResponse(res, 200, order, "Order fetched successfully");
});

export const updateMyOrderStatus = catchAsync(async (req, res) => {
  const order = await vendorOrderService.updateMyVendorOrderStatus(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  apiResponse(res, 200, order, "Order updated");
});

/** The four counters the overview shows, counted from the seller's own rows. */
export const getOrderSummary = catchAsync(async (req, res) => {
  const summary = await vendorOrderService.getVendorOrderSummary(req.user!.id);
  apiResponse(res, 200, summary, "Order summary fetched successfully");
});
