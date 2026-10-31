import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { currentUserId } from "../../utils/authz";
import * as activityService from "./activity.service";
import { getFeedQuerySchema } from "./activity.validator";

/**
 * One module, one feed.
 *
 * Every role reads the same endpoint: the store team gets the shared list, a
 * customer or a rider gets the lines addressed to them, and the seller side
 * will get its own when it ships. The route never names a user id — it always
 * comes from the token.
 */

export const getMyFeed = catchAsync(async (req, res) => {
  const query = parseQuery(getFeedQuerySchema, req.query);
  const requester = {
    id: currentUserId(req.user),
    role: req.user?.role as string | undefined,
  };

  const result = await activityService.getFeed(requester, query);

  // The bell writes "3m ago" beside every line, so it gets the clock that wrote
  // the timestamps: a device with a wrong system time can no longer shift them.
  apiResponse(
    res,
    200,
    { ...result, serverTime: new Date().toISOString() },
    "Notifications fetched successfully"
  );
});

export const getUnreadCount = catchAsync(async (req, res) => {
  const result = await activityService.getUnreadCount(currentUserId(req.user));
  apiResponse(res, 200, result, "Unread count fetched successfully");
});

export const markRead = catchAsync(async (req, res) => {
  const notification = await activityService.markRead(
    currentUserId(req.user),
    req.params.id as string
  );
  apiResponse(res, 200, notification, "Notification marked as read");
});

export const markAllRead = catchAsync(async (req, res) => {
  const result = await activityService.markAllRead(currentUserId(req.user));
  apiResponse(res, 200, result, "Notifications marked as read");
});
