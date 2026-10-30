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
  // Trimmed first, so a reason made only of spaces is rejected instead of
  // being stored as an empty string.
  reason: z.string().trim().min(1, "Reason is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
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

/**
 * A message the admin writes to the customer from the warranty screen. The
 * recipient is resolved from the warranty record, never from this body.
 */
export const emailWarrantySchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(150, "Subject is too long"),
  message: z.string().trim().min(1, "Message is required").max(3000, "Message is too long"),
});

/**
 * An admin extends the coverage of one warranty.
 *
 * Months instead of a date on purpose: an extension always adds real time to
 * whatever is left, so it can never produce a date that has already passed.
 */
export const extendWarrantySchema = z.object({
  months: z.coerce
    .number()
    .int("Use whole months")
    .min(1, "Add at least one month")
    .max(60, "At most 60 months can be added at a time"),
  reason: z
    .string()
    .trim()
    .min(1, "Say why this warranty is being extended")
    .max(500, "Keep the reason under 500 characters"),
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
export type EmailWarrantyInput = z.infer<typeof emailWarrantySchema>;
export type ExtendWarrantyInput = z.infer<typeof extendWarrantySchema>;
export type GetWarrantiesQuery = z.infer<typeof getWarrantiesQuerySchema>;