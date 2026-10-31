import { Types, type SortOrder } from "mongoose";
import { Activity, STORE_ACTIVITY_TYPES, PERSONAL_ACTIVITY_TYPES } from "./activity.model";
import { ApiError } from "../../utils/apiError";
import { GetFeedQuery } from "./activity.validator";
import { isAdminRole } from "../../utils/roles";

export type StoreActivityType = (typeof STORE_ACTIVITY_TYPES)[number];
export type PersonalActivityType = (typeof PERSONAL_ACTIVITY_TYPES)[number];
export type ActivityType = StoreActivityType | PersonalActivityType;
export type NotificationRole = "customer" | "rider" | "vendor" | "admin";

export interface NewActivity {
  type: StoreActivityType;
  title: string;
  detail?: string;
  ref?: string;
}

export interface NewNotification {
  userId: string;
  role: NotificationRole;
  type: PersonalActivityType;
  title: string;
  detail?: string;
  ref?: string;
}

/** Who is reading the feed: the id decides which lines, the role which list. */
export interface Requester {
  id: string;
  role?: string | null;
}

/** Every type a feed can hold, so a chip naming an unknown value is ignored. */
const KNOWN_TYPES = new Set<string>([...STORE_ACTIVITY_TYPES, ...PERSONAL_ACTIVITY_TYPES]);

/** Escapes a search term, so "a+b" is matched literally instead of as a regex. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The known types named in a comma-separated `type`, unknown ones dropped. */
function parseTypes(type?: string): string[] {
  if (!type) return [];
  return type
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && KNOWN_TYPES.has(value));
}

/** `title` or `detail` containing the search term, case-insensitively. */
function searchFilter(search?: string): Record<string, unknown> | null {
  if (!search) return null;
  const match = new RegExp(escapeRegex(search), "i");
  return { $or: [{ title: match }, { detail: match }] };
}

/** How many lines of each type a base filter would hold, for the filter chips. */
async function countByType(base: Record<string, unknown>): Promise<Record<string, number>> {
  const rows = await Activity.aggregate<{ _id: string; count: number }>([
    { $match: base },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[String(row._id)] = Number(row.count) || 0;
    return counts;
  }, {});
}

// ─── Store feed ───────────────────────────────────────────────────────────────

/**
 * Adds one line to the store team's feed.
 *
 * It never throws. An activity is a side note, so a failed write must not turn a
 * completed order (or a deleted user) into an error the caller sees.
 */
export async function recordActivity(data: NewActivity): Promise<void> {
  try {
    await Activity.create({
      type: data.type,
      title: data.title,
      detail: data.detail || "",
      ref: data.ref || "",
    });
  } catch (err) {
    console.error("[activity] Could not save activity:", (err as Error).message);
  }
}

/**
 * Writes one line for a single account.
 *
 * Same collection, same shape — only the row carries an owner, which is what
 * makes it a notification instead of a note on the shared board. It never
 * throws either: a notification is a side note, so a failed write must not turn
 * a completed delivery or a placed order into an error the caller sees.
 */
export async function notifyUser(data: NewNotification): Promise<void> {
  try {
    await Activity.create({
      userId: data.userId,
      role: data.role,
      type: data.type,
      title: data.title,
      detail: data.detail || "",
      ref: data.ref || "",
    });
  } catch (err) {
    console.error("[activity] Could not save notification:", (err as Error).message);
  }
}

/**
 * One page of "what happened", for whoever is asking.
 *
 * Every role reads this same feed. The store team's copy is the shared list —
 * the lines with no owner — and everybody else reads the lines addressed to
 * them. That is the only difference: the search, the type chips, the order, the
 * unread switch and the pager are the same for all four roles.
 *
 * `shared` tells the app which read mark applies. A shared line's dot lives on
 * the device, because one admin's read must not clear the whole team's; a
 * personal line's dot is the server's `readAt`, so it clears everywhere.
 */
export async function getFeed(requester: Requester, query: GetFeedQuery) {
  const shared = isAdminRole(requester.role);
  const { page, limit, unread, search, sort } = query;
  const types = parseTypes(query.type);

  // A shared line has no owner; a personal one is found by the token's own id.
  const owner: Record<string, unknown> = shared
    ? { userId: null }
    : { userId: new Types.ObjectId(requester.id) };

  const filter: Record<string, unknown> = { ...owner };
  if (!shared && unread === "true") filter.readAt = null;
  if (types.length) filter.type = { $in: types };
  const text = searchFilter(search);
  if (text) filter.$or = text.$or;

  // The chips count everything the search allows except the type itself, so a
  // chip's number says what pressing it would show.
  const countBase: Record<string, unknown> = { ...owner };
  if (!shared && unread === "true") countBase.readAt = null;
  if (text) countBase.$or = text.$or;

  const order: Record<string, SortOrder> =
    sort === "oldest"
      ? { createdAt: 1, _id: 1 }
      : sort === "unread" && !shared
        ? // Empty `readAt` sorts first, so the dots gather at the top; within
          // each group the newest line still leads.
          { readAt: 1, createdAt: -1, _id: -1 }
        : { createdAt: -1, _id: -1 };

  const [lines, total, unreadCount, typeCounts] = await Promise.all([
    Activity.find(filter).sort(order).skip((page - 1) * limit).limit(limit).lean(),
    Activity.countDocuments(filter),
    // A shared list has no per-person read state, so the app counts its own dots.
    shared ? Promise.resolve(0) : Activity.countDocuments({ ...owner, readAt: null }),
    countByType(countBase),
  ]);

  return {
    lines,
    total,
    unreadCount,
    typeCounts,
    shared,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUnreadCount(userId: string) {
  const count = await Activity.countDocuments({
    userId: new Types.ObjectId(userId),
    readAt: null,
  });
  return { unreadCount: count };
}

/** Marks one of the caller's own lines as read. */
export async function markRead(userId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Notification not found");

  const notification = await Activity.findOneAndUpdate(
    { _id: id, userId: new Types.ObjectId(userId) },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) throw new ApiError(404, "Notification not found");
  return notification;
}

/** Marks every unread line of the caller as read. */
export async function markAllRead(userId: string) {
  const result = await Activity.updateMany(
    { userId: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } }
  );

  return { updated: result.modifiedCount };
}
