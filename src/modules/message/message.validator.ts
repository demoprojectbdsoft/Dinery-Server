import { z } from "zod";

export const getMessagesQuerySchema = z.object({
  status: z.enum(["all", "sent", "failed"]).optional().default("all"),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
