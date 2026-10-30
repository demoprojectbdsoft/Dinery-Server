import { z } from "zod";

/** The bell only ever asks for the last handful, so the cap stays small. */
export const getActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(30).default(8),
});

/** The customer/rider feed is a pageable list, not a fixed head of the list. */
export const getNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unread: z.enum(["true", "false"]).optional(),
});

export type GetActivitiesQuery = z.infer<typeof getActivitiesQuerySchema>;
export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;
