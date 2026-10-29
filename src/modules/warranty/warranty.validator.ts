import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ID");

/**
 * The problems a customer can pick when filing a claim. Keeping the list on the
 * server means an unknown value can never be stored, while the labels shown to
 * the customer live on the frontend.
 */
export const CLAIM_PROBLEM_VALUES = [
  "not_working",
  "stopped_working",
  "damaged_on_arrival",
  "battery_issue",
  "display_issue",
  "missing_parts",
  "other",
] as const;

/**
 * A customer submits a warranty claim for an existing, active warranty record.
 * The customer's own identity is resolved server-side from the auth token, so
 * the request body only carries the warranty reference and the claim details.
 */
export const submitWarrantyClaimSchema = z.object({
  warrantyId: objectId,
  // Kept optional: the claim form no longer asks for it, but older clients and
  // existing records still carry a code from CLAIM_PROBLEM_VALUES.
  problem: z.enum(CLAIM_PROBLEM_VALUES, { message: "Choose what went wrong with the product" }).optional(),
  reason: z.string().min(1, "Reason is required").max(200),
  description: z.string().min(1, "Description is required").max(2000),
  images: z.array(z.string().url()).max(5, "Maximum 5 images per claim").optional().default([]),
});

/**
 * Admin actions on a claim.
 */
export const adminUpdateClaimSchema = z.object({
  action: z.enum(["mark_under_review", "request_info", "resolve", "reject"]),
  adminNote: z.string().max(2000).optional(),
  resolution: z.string().max(2000).optional(),
});

export const getWarrantiesQuerySchema = z.object({
  userId: z.string().optional(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SubmitWarrantyClaimInput = z.infer<typeof submitWarrantyClaimSchema>;
export type AdminUpdateClaimInput = z.infer<typeof adminUpdateClaimSchema>;
export type GetWarrantiesQuery = z.infer<typeof getWarrantiesQuerySchema>;