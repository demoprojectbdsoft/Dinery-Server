import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as activityService from "./activity.service";
import { getActivitiesQuerySchema } from "./activity.validator";

/** The admin notification feed: the most recent things that happened. */

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
