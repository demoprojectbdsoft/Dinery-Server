import { Types } from "mongoose";
import { z } from "zod";

/**
 * Shared helpers for the mixed id conventions in this codebase.
 *
 * Some references are stored as plain strings and some as ObjectIds, so a
 * query usually has to match both shapes. Keeping that logic in one place
 * stops every service from reinventing it.
 */

/** Zod rule for a 24-character hex ObjectId string. */
export const objectIdSchema = (message = "Invalid ID") =>
  z.string().regex(/^[0-9a-fA-F]{24}$/, message);

/** The id as given, plus its ObjectId form when it is a valid ObjectId. */
export function idVariants(id: string): (string | Types.ObjectId)[] {
  return Types.ObjectId.isValid(id) ? [id, new Types.ObjectId(id)] : [id];
}

/** Filter value that matches a reference stored as either a string or an ObjectId. */
export function idQuery(id: string) {
  return Types.ObjectId.isValid(id) ? { $in: idVariants(id) } : id;
}

/**
 * Converts a string to an ObjectId when possible, otherwise returns it
 * unchanged. Returns `any` because callers pass ids of unknown shape (raw log
 * entries, populated refs) straight into Mongo filters.
 */
export function toObjectId(id: unknown): any {
  if (id instanceof Types.ObjectId) return id;
  if (typeof id === "string" && Types.ObjectId.isValid(id)) {
    return new Types.ObjectId(id);
  }
  return id;
}

/**
 * Reads the id out of a reference that may be a raw id or a populated document.
 */
export function refIdString(ref: any) {
  if (ref && typeof ref === "object" && "_id" in ref) return ref._id.toString();
  return ref?.toString?.();
}
