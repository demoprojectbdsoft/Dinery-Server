import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { currentUserId } from "../../utils/authz";
import * as activityService from "./activity.service";
import { getActivitiesQuerySchema, getNotificationsQuerySchema } from "./activity.validator";

/**
 * Feeds. One module, two audiences: the store team reads everything that
 * happened, a customer or rider reads only the lines addressed to them.
 */

/** The store feed: the most recent things that happened. */
export const getActivities = catchAsync(async (req, res) => {
  const { limit } = parseQuery(getActivitiesQuerySchema, req.query);
  const activities = await activityService.getActivities(limit);
  // The bell writes "3m ago" beside every line, so it gets the clock that wrote
  // the timestamps: a device with a wrong system time can no longer shift them.
  apiResponse(
    res,
    200,
    { activities, serverTime: new Date().toISOString() },
    "Activities fetched successfully"
  );
});

/** The caller's own feed. A token never reaches anybody else's lines. */
export const getMyNotifications = catchAsync(async (req, res) => {
  const query = parseQuery(getNotificationsQuerySchema, req.query);
  const result = await activityService.getNotifications(currentUserId(req.user), query);
  // The same contract as the store feed: the lines travel with the clock that
  // stamped them, so "3m ago" is right even on a device with a wrong time.
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
