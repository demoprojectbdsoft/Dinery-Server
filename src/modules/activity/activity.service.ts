import { Activity } from "./activity.model";

export type ActivityType =
  | "order"
  | "transaction"
  | "user"
  | "user_deleted"
  | "order_cancelled"
  | "warranty"
  | "message";

export interface NewActivity {
  type: ActivityType;
  title: string;
  detail?: string;
  ref?: string;
}

/**
 * Adds one line to the admin's activity feed.
 *
 * It never throws. A notification is a side note, so a failed write must not
 * turn a completed order (or a deleted user) into an error the caller sees.
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

/** The newest lines first, which is the order the bell shows them in. */
export async function getActivities(limit: number) {
  return Activity.find().sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
}
