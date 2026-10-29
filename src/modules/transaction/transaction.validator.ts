import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ID");

export const getTransactionsQuerySchema = z.object({
  userId: objectId.optional(),
  orderId: objectId.optional(),
  status: z.enum(["all", "pending", "success", "failed"]).optional(),
  method: z.enum(["all", "cod", "bkash", "rocket", "nagad"]).optional(),
  search: z.string().optional(),
  sort: z.enum(["newest", "oldest", "amount_asc", "amount_desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(10),
});

export type GetTransactionsQuery = z.infer<typeof getTransactionsQuerySchema>;