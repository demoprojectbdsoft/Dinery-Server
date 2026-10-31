import { z } from "zod";
import { BILLING_CYCLES, VENDOR_PLAN_IDS } from "./vendor.types";

/**
 * A vendor buying a plan period.
 *
 * The price is never sent: the server reads it from the plan table. The browser
 * only chooses which plan, how long and how it pays. `idempotencyKey` is what
 * makes a double-clicked Pay button one payment rather than two.
 */

export const SUBSCRIPTION_PAYMENT_METHODS = ["bkash", "nagad", "rocket", "wallet"] as const;

export const checkoutSubscriptionSchema = z.object({
  planId: z.enum(VENDOR_PLAN_IDS),
  billingCycle: z.enum(BILLING_CYCLES).default("monthly"),
  method: z.enum(SUBSCRIPTION_PAYMENT_METHODS),
  /** The wallet SMS reference; not needed for the in-site demo wallet. */
  transactionId: z.string().trim().max(24).optional(),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export type CheckoutSubscriptionInput = z.infer<typeof checkoutSubscriptionSchema>;
