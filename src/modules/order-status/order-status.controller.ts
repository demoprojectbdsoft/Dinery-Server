import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { parseQuery } from "../../utils/validate";
import { assertOwnerOrAdmin } from "../../utils/authz";
import { Order } from "../order/order.model";
import * as orderStatusService from "./order-status.service";
import { getOrderStatusQuerySchema } from "./order-status.validator";

/**
 * The timeline belongs to the order, so only its owner (or an admin) may read
 * it — the query string alone is not proof of ownership.
 */
export const getOrderStatusHistory = catchAsync(async (req, res) => {
  const { orderId } = parseQuery(getOrderStatusQuerySchema, req.query);

  const order = await Order.findById(orderId).select("userId").lean();
  if (!order) throw new ApiError(404, "Order not found");

  assertOwnerOrAdmin(order.userId, req.user, "You are not allowed to view this order");

  const history = await orderStatusService.getOrderStatusHistory(orderId);
  apiResponse(res, 200, history);
});
