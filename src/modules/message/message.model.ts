import { Schema, model } from "mongoose";

/**
 * One message written on the contact page.
 *
 * It is stored **before** the email is attempted, so a mail problem can never
 * lose what a visitor wrote. The admin reads it in the dashboard, and `status`
 * says whether the email copy also went out.
 */
const messageSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    // "support" or "contact" — decides which inbox it belongs to.
    department: { type: String, default: "support" },
    subject: { type: String, default: "" },
    body: { type: String, required: true },
    // The inbox it was emailed to, kept so the admin knows where the copy went.
    sentTo: { type: String, default: "" },
    status: { type: String, enum: ["sent", "failed"], default: "failed" },
    // Why the email failed, in the mail provider's own words.
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

export const Message = model("Message", messageSchema);
