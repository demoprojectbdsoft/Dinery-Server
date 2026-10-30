import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { currentUserId } from "../../utils/authz";
import * as deliveryService from "./delivery.service";
import { getRiderDeliveriesQuerySchema, riderStatsQuerySchema } from "./delivery.validator";

/**
 * The rider's own delivery screens.
 *
 * The rider id always comes from the token: no route here accepts an id in the
 * URL or the body, so there is nothing to tamper with.
 */

export const getMyStats = catchAsync(async (req, res) => {
  const { days } = parseQuery(riderStatsQuerySchema, req.query);
  const result = await deliveryService.getRiderStats(currentUserId(req.user), { days });
  apiResponse(res, 200, result, "Rider statistics fetched successfully");
});

export const getMyDeliveries = catchAsync(async (req, res) => {
  const query = parseQuery(getRiderDeliveriesQuerySchema, req.query);
  const result = await deliveryService.getRiderDeliveries(currentUserId(req.user), query);
  apiResponse(res, 200, result, "Deliveries fetched successfully");
});
