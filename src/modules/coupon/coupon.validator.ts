import { z } from "zod";

/**
 * Coupon shapes, for the store team's desk and for the seller's own codes.
 *
 * The two writers share one document, so they share one validator: a vendor's
 * coupon and an admin's global coupon are checked by the same rules and can only
 * differ in what the route lets them set (`ownerType`, `vendorId`, `storeId` are
 * never taken from the body).
 *
 * Amounts are validated here, but the discount a shopper finally gets is worked
 * out again in the service from the server's own prices — a browser cannot make
 * a 10% coupon worth 50%.
 */

/** A Mongo id, written the only way the drivers accept. */
const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, "A valid id is required");

/** Upper-case, no spaces: the code is stored exactly as it is matched. */
const codeField = z
  .string()
  .trim()
  .min(3, "A coupon code needs at least 3 characters")
  .max(32, "A coupon code cannot be longer than 32 characters")
  .regex(/^[A-Z0-9_-]+$/, "Use capital letters, numbers, hyphens and underscores only")
  .transform((value) => value.toUpperCase());

export const createCouponSchema = z
  .object({
    code: codeField,
    title: z.string().trim().max(120).optional().default(""),
    description: z.string().trim().max(500).optional().default(""),

    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce.number().min(0),

    minOrderAmount: z.coerce.number().min(0).optional().default(0),
    /** 0 means "no cap" on a percentage coupon. */
    maxDiscountAmount: z.coerce.number().min(0).optional().default(0),

    startDate: z.coerce.date(),
    endDate: z.coerce.date(),

    totalUsageLimit: z.coerce.number().int().min(0).optional().default(0),
    perCustomerLimit: z.coerce.number().int().min(0).optional().default(0),

    /** Empty means every product the owner may discount. */
    productIds: z.array(objectId).max(100).optional().default([]),
    categoryIds: z.array(objectId).max(50).optional().default([]),

    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "percentage" && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A percentage coupon is between 1 and 100",
        path: ["discountValue"],
      });
    }
    if (data.discountValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A coupon has to take something off",
        path: ["discountValue"],
      });
    }
    if (data.endDate.getTime() <= data.startDate.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A coupon has to end after it starts",
        path: ["endDate"],
      });
    }
  });

/** Every field is optional, so a single switch can be flipped without resending the code. */
export const updateCouponSchema = createCouponSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, "Send at least one field to change");

/**
 * What the cart and the checkout send to ask "does this code work on my basket?".
 *
 * Only product ids and quantities: prices, sellers and categories are read back
 * from the database, so the answer cannot be steered from the browser.
 */
export const validateCouponSchema = z.object({
  code: codeField,
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.coerce.number().int().min(1).max(999),
      })
    )
    .min(1, "There is nothing in the cart to discount")
    .max(200, "The cart has too many lines to check at once"),
});

export const couponQuerySchema = z.object({
  /** `all` keeps the admin's own and every vendor's codes together. */
  owner: z.enum(["all", "admin", "vendor"]).optional().default("all"),
  status: z.enum(["all", "live", "upcoming", "expired", "stopped"]).optional().default("all"),
  search: z.string().trim().max(60).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;
export type CouponQuery = z.infer<typeof couponQuerySchema>;
