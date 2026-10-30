import { Types } from "mongoose";
import { Activity, STORE_ACTIVITY_TYPES, PERSONAL_ACTIVITY_TYPES } from "./activity.model";
import { ApiError } from "../../utils/apiError";
import { GetNotificationsQuery } from "./activity.validator";

export type StoreActivityType = (typeof STORE_ACTIVITY_TYPES)[number];
export type PersonalActivityType = (typeof PERSONAL_ACTIVITY_TYPES)[number];
export type ActivityType = StoreActivityType | PersonalActivityType;
export type NotificationRole = "customer" | "rider" | "admin";

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
 * The newest store lines first, which is the order the bell shows them in.
 * Lines addressed to one person are filtered out: they belong in that person's
 * own feed, not in the store-wide one.
 */
export async function getActivities(limit: number) {
  return Activity.find({ userId: null }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
}

// ─── Personal feed ────────────────────────────────────────────────────────────

/**
 * Writes one activity line for a single customer or rider.
 *
 * It never throws: a notification is a side note, so a failed write must not
 * turn a completed delivery or a placed order into an error the caller sees.
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

/** The caller's own lines, newest first. */
export async function getNotifications(userId: string, query: GetNotificationsQuery) {
  const { page, limit, unread } = query;
  const owner = { userId: new Types.ObjectId(userId) };
  const filter: Record<string, unknown> = { ...owner };
  if (unread === "true") filter.readAt = null;

  const [notifications, total, unreadCount] = await Promise.all([
    Activity.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Activity.countDocuments(filter),
    Activity.countDocuments({ ...owner, readAt: null }),
  ]);

  return {
    notifications,
    total,
    unreadCount,
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
