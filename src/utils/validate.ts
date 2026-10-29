import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodType } from "zod";
import { ApiError } from "./apiError";

/** Body validator used as route middleware: replaces req.body with the parsed value. */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(new ApiError(400, parsed.error.issues[0].message));
    }
    req.body = parsed.data;
    next();
  };
}

/**
 * Same validation, but for query strings — returns the parsed data so the
 * controller can use it, and throws a 400 the error middleware will format.
 */
export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0].message);
  }
  return parsed.data;
}