import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { vendorAnalyticsQuerySchema } from "./vendor-analytics.validator";
import * as vendorAnalyticsService from "./vendor-analytics.service";

/**
 * The seller's report.
 *
 * The vendor id comes from the token and nowhere else, so the window can be
 * chosen but the shop cannot.
 */

export const getMyAnalytics = catchAsync(async (req, res) => {
  const query = parseQuery(vendorAnalyticsQuerySchema, req.query);
  const report = await vendorAnalyticsService.getVendorAnalytics(req.user!.id, query);
  apiResponse(res, 200, report, "Analytics fetched successfully");
});
