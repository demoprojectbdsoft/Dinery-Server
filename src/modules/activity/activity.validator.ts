import { z } from "zod";

/** The bell only ever asks for the last handful, so the cap stays small. */
export const getActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(30).default(8),
});

export type GetActivitiesQuery = z.infer<typeof getActivitiesQuerySchema>;
