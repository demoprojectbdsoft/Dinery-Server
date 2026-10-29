import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { assertOwnerOrAdmin, currentUserId, scopedUserId } from "../../utils/authz";
import * as orderService from "./order.service";
import { getOrdersQuerySchema } from "./order.validator";

export const createOrder = catchAsync(async (req, res) => {
  // The buyer is always the caller — the body cannot name somebody else.
  const order = await orderService.createOrder(req.body, currentUserId(req.user));
  apiResponse(res, 201, order, "Order placed successfully");
});

export const getOrders = catchAsync(async (req, res) => {
  const query = parseQuery(getOrdersQuerySchema, req.query);

  // A customer only ever sees their own orders; an admin may filter freely.
  const result = await orderService.getOrders({
    ...query,
    userId: scopedUserId(req.user, query.userId),
  });
  apiResponse(res, 200, result, "Orders fetched successfully");
});

export const getOrderById = catchAsync(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id as string);
  assertOwnerOrAdmin(order.userId, req.user, "You are not allowed to view this order");
  apiResponse(res, 200, order);
});

export const updateOrderStatus = catchAsync(async (req, res) => {
  const order = await orderService.updateOrderStatus(
    req.params.id as string,
    req.body,
    req.user?.id
  );
  apiResponse(res, 200, order, "Order status updated");
});

export const updateCustomerResponse = catchAsync(async (req, res) => {
  const order = await orderService.updateCustomerResponse(
    req.params.id as string,
    req.body,
    req.user
  );
  apiResponse(res, 200, order, "Customer response updated successfully");
});