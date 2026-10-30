import { Schema, model } from "mongoose";

/**
 * The code a rider reads out at the door.
 *
 * Real couriers receive a code by SMS; this demo has no SMS gateway, so the
 * customer's own dashboard shows the code and they read it to the rider. The
 * code is stored twice on purpose:
 *
 * - `codeHash` is what verification uses. It is a SHA-256 of the code plus the
 *   delivery id, so two deliveries with the same code still hash differently.
 * - `code` exists only so the owning customer can be shown it. It is never
 *   returned to a rider, an admin, or any list endpoint.
 */
const deliveryOtpSchema = new Schema(
  {
    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      unique: true,
      index: true,
    },
    code: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    verifiedAt: { type: Date, default: null },
    /** How many times the customer replaced a code they could not read. */
    regenerated: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const DELIVERY_OTP_TTL_MINUTES = 30;
export const DELIVERY_OTP_MAX_ATTEMPTS = 5;

export const DeliveryOTP = model("DeliveryOTP", deliveryOtpSchema);
