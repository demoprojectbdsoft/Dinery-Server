import { z } from "zod";

/**
 * What may be asked of a featured placement.
 *
 * Neither desk takes a date or a plan from the body: the seller's own placements
 * are cut to the length their plan says, and an admin grant states its length in
 * days. The owner, the store and the clock are all derived on the server.
 */

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "A valid id is required");

export const promotionQuerySchema = z.object({
  /** `live` means the row is active and its clock has not run out. */
  status: z.enum(["all", "live", "ended", "cancelled"]).optional().default("all"),
  kind: z.enum(["all", "product", "store"]).optional().default("all"),
  /** Only the store team's board can ask for one seller among everyone's. */
  vendorId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** The seller only ever names the product. Everything else comes from the token. */
export const featureProductSchema = z.object({
  productId: objectId,
});

/**
 * The store team's grant.
 *
 * A product grant names the product and the seller is read from it; a store
 * grant names the seller and the shop is read from them. Neither can be pointed
 * at someone else's shelf.
 */
export const grantPromotionSchema = z
  .object({
    kind: z.enum(["product", "store"]),
    productId: objectId.optional(),
    vendorId: objectId.optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
    /** Why the store team lifted this shop, kept on the row's history. */
    reason: z.string().trim().max(200).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "product" && !data.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A product placement needs the product to feature",
        path: ["productId"],
      });
    }
    if (data.kind === "store" && !data.vendorId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A store placement needs the seller whose shop to lift",
        path: ["vendorId"],
      });
    }
  });

/** Closing a placement early always says why, because the seller sees it. */
export const endPromotionSchema = z.object({
  reason: z.string().trim().min(3).max(200).default("Ended by the store team"),
});

export type PromotionQuery = z.infer<typeof promotionQuerySchema>;
export type FeatureProductInput = z.infer<typeof featureProductSchema>;
export type GrantPromotionInput = z.infer<typeof grantPromotionSchema>;
export type EndPromotionInput = z.infer<typeof endPromotionSchema>;
