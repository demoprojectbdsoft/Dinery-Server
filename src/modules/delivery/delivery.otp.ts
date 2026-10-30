import crypto from "node:crypto";
import { Types } from "mongoose";
import {
  DeliveryOTP,
  DELIVERY_OTP_MAX_ATTEMPTS,
  DELIVERY_OTP_TTL_MINUTES,
} from "./delivery.otp.model";
import { ApiError } from "../../utils/apiError";

/**
 * The delivery code: issuing it, showing it to the buyer, and checking it.
 *
 * The code is never returned to a rider or a list endpoint. Only the order's
 * owner reads it, which stands in for the SMS a real courier network would
 * send.
 */

/** Six digits, uniform, with no modulo bias. */
function randomCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

/** The hash binds a code to one delivery, so equal codes never collide. */
function hashCode(deliveryId: string, code: string): string {
  return crypto.createHash("sha256").update(`${deliveryId}:${code}`).digest("hex");
}

function expiryFromNow(): Date {
  return new Date(Date.now() + DELIVERY_OTP_TTL_MINUTES * 60_000);
}

/**
 * Makes sure this delivery has a usable code.
 *
 * Called when the parcel goes out for delivery, and again if a customer
 * regenerates. An existing unverified, unexpired code is left alone: replacing
 * it on every read would text the customer a new code each time they looked.
 */
export async function ensureOtp(deliveryId: string | Types.ObjectId, force = false) {
  const id = new Types.ObjectId(String(deliveryId));
  const existing = await DeliveryOTP.findOne({ deliveryId: id });

  const stillUsable =
    existing && !existing.verifiedAt && new Date(existing.expiresAt).getTime() > Date.now();

  if (existing && stillUsable && !force) return existing;

  const code = randomCode();
  const fields = {
    code,
    codeHash: hashCode(String(id), code),
    expiresAt: expiryFromNow(),
    attempts: 0,
    verifiedAt: null,
  };

  if (!existing) {
    return DeliveryOTP.create({ deliveryId: id, ...fields, regenerated: 0 });
  }

  // A regenerated code starts a fresh attempt budget, and the count says how
  // many times the customer had to ask again.
  existing.set({
    ...fields,
    regenerated: (existing.regenerated || 0) + (force ? 1 : 0),
  });
  await existing.save();
  return existing;
}

/** The buyer's copy of the code, for the tracking page. */
export async function getCustomerOtp(deliveryId: string) {
  const otp = await DeliveryOTP.findOne({ deliveryId: new Types.ObjectId(deliveryId) });
  if (!otp) return null;

  const expiresInMs = new Date(otp.expiresAt).getTime() - Date.now();

  return {
    code: otp.code,
    expiresAt: new Date(otp.expiresAt).toISOString(),
    expired: expiresInMs <= 0,
    verified: Boolean(otp.verifiedAt),
    attemptsLeft: Math.max(0, (otp.maxAttempts || DELIVERY_OTP_MAX_ATTEMPTS) - (otp.attempts || 0)),
    regenerated: otp.regenerated || 0,
  };
}

/**
 * Checks a code the rider typed in, and burns an attempt when it is wrong.
 *
 * Returns nothing on success; throws a message the rider can act on otherwise.
 * Every failure path increments the counter, including an expired code, so a
 * stale code cannot be brute-forced by waiting.
 */
export async function verifyOtpCode(deliveryId: string, code: string): Promise<void> {
  const id = new Types.ObjectId(deliveryId);
  const otp = await DeliveryOTP.findOne({ deliveryId: id });

  if (!otp) {
    throw new ApiError(400, "This delivery has no code yet. Ask the customer to open the tracking page.");
  }
  if (otp.verifiedAt) return;

  const max = otp.maxAttempts || DELIVERY_OTP_MAX_ATTEMPTS;
  if ((otp.attempts || 0) >= max) {
    throw new ApiError(429, "Too many wrong codes. Ask the customer to generate a new one.");
  }
  if (new Date(otp.expiresAt).getTime() <= Date.now()) {
    throw new ApiError(400, "This code has expired. Ask the customer to generate a new one.");
  }

  const expected = hashCode(String(id), code);
  const same =
    expected.length === otp.codeHash.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(otp.codeHash));

  if (!same) {
    otp.attempts = (otp.attempts || 0) + 1;
    await otp.save();
    const left = Math.max(0, max - otp.attempts);
    throw new ApiError(
      400,
      left > 0
        ? `That code is not right. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "That code is not right, and there are no attempts left. Ask the customer for a new code."
    );
  }

  otp.verifiedAt = new Date();
  await otp.save();
}

/** Marks the code as used once the order has been closed as delivered. */
export async function markOtpUsed(deliveryId: string) {
  await DeliveryOTP.updateOne(
    { deliveryId: new Types.ObjectId(deliveryId), verifiedAt: null },
    { $set: { verifiedAt: new Date() } }
  );
}
