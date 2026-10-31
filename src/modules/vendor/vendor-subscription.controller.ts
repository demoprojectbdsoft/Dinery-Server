import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import * as subscriptionService from "./vendor-subscription.service";

/**
 * A vendor's own subscription.
 *
 * Every route is scoped to the signed-in account: there is no vendor id in a
 * path or a body, so one seller can never read or buy for another.
 */

export const getMySubscription = catchAsync(async (req, res) => {
  const overview = await subscriptionService.getSubscriptionOverview(req.user!.id);
  apiResponse(res, 200, overview, "Subscription fetched successfully");
});

export const checkout = catchAsync(async (req, res) => {
  const result = await subscriptionService.checkoutSubscription(req.user!.id, req.body);
  apiResponse(
    res,
    result.duplicate ? 200 : 201,
    result,
    result.duplicate ? "This payment was already processed" : "Subscription updated"
  );
});

export const cancelSubscriptionRenewal = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.cancelRenewal(req.user!.id);
  apiResponse(res, 200, subscription, "Renewal cancelled; the current period still runs");
});

/**
 * Closes every period that has run past its grace window.
 *
 * A vendor who never opens their dashboard after midnight still has a row that
 * reads `active`, so this sweep exists for the shops nobody is looking at. It
 * also dims whatever their expired plan had bought on the featured shelves.
 */
export const expireSubscriptions = catchAsync(async (_req, res) => {
  const result = await subscriptionService.expireDueSubscriptions();
  apiResponse(res, 200, result, "Lapsed periods closed");
});
