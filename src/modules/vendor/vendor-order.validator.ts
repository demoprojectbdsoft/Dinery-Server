import { z } from "zod";

/**
 * The vendor's order screens.
 *
 * A vendor never sends their own id and never sends the parent order's status:
 * the token identifies the seller and the API decides which status a group may
 * move to. The rejection reason is the only free text.
 */

export const vendorOrderQuerySchema = z.object({
  status: z.string().trim().optional().default("all"),
  search: z.string().trim().optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const vendorOrderStatusSchema = z.object({
  status: z.enum(["accepted", "processing", "ready_for_shipment", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

export type VendorOrderQuery = z.infer<typeof vendorOrderQuerySchema>;
export type VendorOrderStatusInput = z.infer<typeof vendorOrderStatusSchema>;
