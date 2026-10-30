import { Schema, model } from "mongoose";

/**
 * How long one activity line is kept. Notifications answer "what just
 * happened", so older lines delete themselves instead of piling up forever.
 */
export const ACTIVITY_TTL_DAYS = 30;

/**
 * One line in the admin notification feed.
 *
 * It stores what changed and the value the dashboard can search for, but never
 * the screen to open: the link is built in the app, so an old line still points
 * at the right page after a route is renamed.
 */
const activitySchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "order",
        "transaction",
        "user",
        "user_deleted",
        "order_cancelled",
        "warranty",
        "message",
      ],
    },
    // For example: "New order #ORD-A1B2C3"
    title: { type: String, required: true },
    // For example: "Nihal Ahmed · 2 items · $129.00"
    detail: { type: String, default: "" },
    // An order id, an email, a message address — whatever the list screen
    // knows how to search by.
    ref: { type: String, default: "" },
    // The TTL index removes the whole line once it is this many seconds old.
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24 * ACTIVITY_TTL_DAYS,
    },
  },
  { versionKey: false }
);

export const Activity = model("Activity", activitySchema);
