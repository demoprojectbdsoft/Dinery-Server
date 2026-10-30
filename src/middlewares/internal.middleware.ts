import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";

/**
 * Guards endpoints the storefront calls on its own behalf, such as sending the
 * password reset email.
 *
 * They cannot be public: anyone could then make the store send mail to any
 * address. A shared key in `x-internal-key` is enough, because the only caller
 * is the Next.js app, which holds the same value in `INTERNAL_API_KEY`.
 */
export function requireInternalKey(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.INTERNAL_API_KEY;

  // Refusing is safer than accepting everything when the value is forgotten.
  if (!expected) {
    return next(new ApiError(500, "INTERNAL_API_KEY is not configured on the server"));
  }

  if (req.headers["x-internal-key"] !== expected) {
    return next(new ApiError(401, "Unauthorized: a valid internal key is required"));
  }

  next();
}
