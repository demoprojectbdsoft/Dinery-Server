import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

export const getOrderStatusQuerySchema = z.object({
  orderId: objectIdSchema("Invalid order id"),
});

export type GetOrderStatusQuery = z.infer<typeof getOrderStatusQuerySchema>;
