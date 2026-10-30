import { Types } from "mongoose";
import { Message } from "./message.model";
import { ApiError } from "../../utils/apiError";
import { getMailIdentity } from "../site-settings/site-settings.service";
import { sendMail } from "../../utils/mailer";
import { visitorReplyEmail } from "../../utils/emailTemplates";
import { GetMessagesQuery, ReplyMessageInput } from "./message.validator";

/** What the contact page collected, before any email is attempted. */
export interface NewMessage {
  name: string;
  email: string;
  department: string;
  subject: string;
  body: string;
}

/** Stores the message. It starts as `failed` until an email really went out. */
export async function saveMessage(data: NewMessage) {
  return Message.create({
    ...data,
    status: "failed",
    sentTo: "",
    error: "",
  });
}

/** Records that the email copy reached the mail provider. */
export async function markSent(id: unknown, inbox: string): Promise<void> {
  await Message.updateOne({ _id: id }, { status: "sent", sentTo: inbox, error: "" });
}

/**
 * Records why the email did not go out. The message itself is already saved, so
 * the admin can still read and answer it.
 */
export async function markFailed(id: unknown, reason: string): Promise<void> {
  await Message.updateOne({ _id: id }, { status: "failed", error: reason });
}

/** Escapes regex special characters so the admin's search text matches literally. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The orders the admin can pick from. Mongoose cannot take a field name from a
 * query string, so each choice maps to a fixed sort object.
 */
const SORT_ORDERS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { name: 1, createdAt: -1 },
  subject: { subject: 1, createdAt: -1 },
};

/** The admin list: filter by delivery status, search, then sort. */
export async function getMessages(query: GetMessagesQuery) {
  const { status, search, sort, page, limit } = query;

  const filter: Record<string, any> = {};
  if (status && status !== "all") filter.status = status;
  if (search?.trim()) {
    // A typed "(" would otherwise be read as a pattern and throw.
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { subject: pattern }];
  }

  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    Message.find(filter)
      .sort(SORT_ORDERS[sort] || SORT_ORDERS.newest)
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments(filter),
  ]);

  return {
    messages,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function deleteMessage(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Message not found");

  const deleted = await Message.findByIdAndDelete(id);
  if (!deleted) throw new ApiError(404, "Message not found");
}

/**
 * Emails the visitor who wrote the contact message.
 *
 * The address comes from the stored message, never from the request body, so a
 * reply can only ever go to the person who asked. The stored message is not
 * changed: it records what the visitor wrote, not what the shop answered.
 */
export async function replyToMessage(
  messageId: string,
  data: ReplyMessageInput
): Promise<{ to: string }> {
  if (!Types.ObjectId.isValid(messageId)) throw new ApiError(404, "Message not found");

  const message = await Message.findById(messageId).lean();
  if (!message) throw new ApiError(404, "Message not found");

  const recipient = (message as any).email as string | undefined;
  if (!recipient) throw new ApiError(400, "This message has no address to reply to");

  // The shop's own look and name, so the reply matches every other email.
  const { brand } = await getMailIdentity();

  const html = visitorReplyEmail({
    brand,
    visitorName: (message as any).name,
    message: data.message,
  });

  const { sent, error } = await sendMail({ to: recipient, subject: data.subject, html });

  if (!sent) {
    // The mail server's own reason reaches the admin, who is the only one who
    // can fix the mailbox settings.
    throw new ApiError(
      502,
      error
        ? `The email could not be sent: ${error}`
        : "The email could not be sent. Check the mail settings and try again."
    );
  }

  return { to: recipient };
}
