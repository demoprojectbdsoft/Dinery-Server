import { ApiError } from "../../utils/apiError";
import { isMailConfigured, sendMail } from "../../utils/mailer";
import { contactMessageEmail } from "../../utils/emailTemplates";
import { getMailIdentity } from "../site-settings/site-settings.service";
import { ContactMessageInput } from "./contact.validator";

/**
 * Emails a visitor's message to the store inbox.
 *
 * Unlike the warranty notifications this email *is* the feature, so a failure is
 * reported back instead of being swallowed: telling the visitor "sent" when
 * nothing left the server would leave them waiting for a reply that never comes.
 */
export async function sendContactMessage(data: ContactMessageInput): Promise<void> {
  // The name and both addresses come from Site Settings, so the owner changes
  // them in the dashboard instead of in a deployment.
  const { storeName, supportInbox, contactInbox } = await getMailIdentity();

  // "General & Business" goes to the contact address, everything else to
  // support. Both fall back to the other one when it has not been filled in.
  const isGeneral = data.department === "contact";
  const inbox = isGeneral ? contactInbox : supportInbox;

  if (!inbox) {
    throw new ApiError(
      503,
      `Site Settings has no ${isGeneral ? "contact" : "support"} email yet`
    );
  }
  if (!isMailConfigured()) {
    throw new ApiError(503, "Email sending is not configured yet");
  }

  const { subject, html } = contactMessageEmail({
    storeName,
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
