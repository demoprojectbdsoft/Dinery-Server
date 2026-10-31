import { z } from "zod";

/**
 * The one feed every role reads.
 *
 * The bell asks for a head of the list and the notifications page asks for a
 * page of it, so the search, the type chips, the order and the unread switch
 * are described once and serve both.
 */
export const getFeedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  /** Matched against the title and the detail, case-insensitively. */
  search: z.string().trim().max(120).optional(),
  /** A comma-separated list of types, so one chip row can ask for several. */
  type: z.string().trim().max(400).optional(),
  /** "unread" keeps the dots at the top, newest first within each group. */
  sort: z.enum(["newest", "oldest", "unread"]).default("newest"),
  unread: z.enum(["true", "false"]).optional(),
});

export type GetFeedQuery = z.infer<typeof getFeedQuerySchema>;
