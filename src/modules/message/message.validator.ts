import { z } from "zod";

export const getMessagesQuerySchema = z.object({
  status: z.enum(["all", "sent", "failed"]).optional().default("all"),
  search: z.string().optional(),
  // The admin picks the order from the toolbar. Newest first is the default.
  sort: z.enum(["newest", "oldest", "name", "subject"]).optional().default("newest"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;

/** What the admin types in the reply composer on the messages screen. */
export const replyMessageSchema = z.object({
  subject: z.string().trim().min(1, "A subject is required").max(200),
  message: z.string().trim().min(1, "Write a message before sending").max(5000),
});

export type ReplyMessageInput = z.infer<typeof replyMessageSchema>;
