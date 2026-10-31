import { z } from "zod";

/**
 * The seller's report screen.
 *
 * The only input is the window. What a window is allowed to cover is decided by
 * the plan in the service, never by the request, so a Free account cannot ask
 * for a year of history by typing a bigger number.
 */

export const ANALYTICS_RANGES = [7, 30, 90, 365] as const;

export const vendorAnalyticsQuerySchema = z.object({
  range: z.coerce
    .number()
    .refine((value) => (ANALYTICS_RANGES as readonly number[]).includes(value), {
      message: "Range must be 7, 30, 90 or 365 days",
    })
    .default(30),
});

export type VendorAnalyticsQuery = { range: number };
