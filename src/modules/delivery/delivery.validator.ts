import { z } from "zod";
import { DELIVERY_STATUSES } from "./delivery.model";

/**
 * The rider's own list: a stage, a search, and a page.
 *
 * `active` and `finished` are shortcuts over several stages, so each dashboard
 * tab can ask for exactly the rows it shows without repeating a status list.
 */
export const getRiderDeliveriesQuerySchema = z.object({
  status: z.enum(["all", "active", "finished", ...DELIVERY_STATUSES]).default("all"),
  search: z.string().optional(),
  sort: z.enum(["newest", "oldest", "fee_desc"]).default("newest"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** How far back the overview charts look. */
export const riderStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(14),
});

export type GetRiderDeliveriesQuery = z.infer<typeof getRiderDeliveriesQuerySchema>;
export type RiderStatsQuery = z.infer<typeof riderStatsQuerySchema>;
