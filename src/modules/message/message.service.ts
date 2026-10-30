import { Types } from "mongoose";
import { Message } from "./message.model";
import { ApiError } from "../../utils/apiError";
import { GetMessagesQuery } from "./message.validator";

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

/** The admin list: filter by delivery status and by a name or address. */
export async function getMessages(query: GetMessagesQuery) {
  const { status, search, page, limit } = query;

  const filter: Record<string, any> = {};
  if (status && status !== "all") filter.status = status;
  if (search?.trim()) {
    // A typed "(" would otherwise be read as a pattern and throw.
    const pattern = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { subject: pattern }];
  }

  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
