import { ApiError } from "../../utils/apiError";
import { isMailConfigured, sendMail } from "../../utils/mailer";
import { contactMessageEmail } from "../../utils/emailTemplates";
import { ContactMessageInput } from "./contact.validator";

const STORE_NAME = process.env.STORE_NAME || "Sparq";

/**
 * Emails a visitor's message to the store inbox.
 *
 * Unlike the warranty notifications this email *is* the feature, so a failure is
 * reported back instead of being swallowed: telling the visitor "sent" when
 * nothing left the server would leave them waiting for a reply that never comes.
 */
export async function sendContactMessage(data: ContactMessageInput): Promise<void> {
  // A dedicated inbox wins, but one shared store inbox is enough to start.
  const inbox = process.env.CONTACT_INBOX || process.env.STORE_INBOX;

  if (!inbox) {
    throw new ApiError(503, "The contact inbox is not configured yet");
  }
  if (!isMailConfigured()) {
    throw new ApiError(503, "Email sending is not configured yet");
  }

  const { subject, html } = contactMessageEmail({
    storeName: STORE_NAME,
    name: data.name,
    email: data.email,
    department: data.department,
    subject: data.subject,
    message: data.message,
  });

  // Reply-to is the visitor, so the shop can answer straight from the inbox.
  const sent = await sendMail({ to: inbox, subject, html, replyTo: data.email });
  if (!sent) {
    throw new ApiError(502, "The message could not be sent. Please try again in a moment.");
  }
}
