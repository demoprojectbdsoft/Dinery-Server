import { isMailConfigured, sendMail } from "../../utils/mailer";
import { contactMessageEmail } from "../../utils/emailTemplates";
import { getMailIdentity } from "../site-settings/site-settings.service";
import * as messageService from "../message/message.service";
import { ContactMessageInput } from "./contact.validator";

/**
 * Saves a visitor's message, then emails a copy to the store inbox.
 *
 * The order matters: the message is written to the database **first**, so a
 * mail problem can never lose what somebody took the time to write. The admin
 * reads it in Dashboard -> Messages, and the record says whether the email copy
 * went out or what stopped it.
 *
 * That is also why a mail failure no longer answers an error: the message was
 * received, and the visitor is told so.
 */
export async function sendContactMessage(
  data: ContactMessageInput
): Promise<{ delivered: boolean }> {
  const note = await messageService.saveMessage({
    name: data.name,
    email: data.email,
    department: data.department,
    subject: data.subject,
    body: data.message,
  });

  // The name and both addresses come from Site Settings, so the owner changes
  // them in the dashboard instead of in a deployment.
  const { storeName, supportInbox, contactInbox } = await getMailIdentity();

  // "General & Business" goes to the contact address, everything else to
  // support. Both fall back to the other one when it has not been filled in.
  const isGeneral = data.department === "contact";
  const inbox = isGeneral ? contactInbox : supportInbox;

  if (!inbox) {
    await messageService.markFailed(
      note._id,
      `Site Settings has no ${isGeneral ? "contact" : "support"} email yet`
    );
    return { delivered: false };
  }
  if (!isMailConfigured()) {
    await messageService.markFailed(note._id, "Email sending is not configured yet");
    return { delivered: false };
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
  const { sent, error } = await sendMail({
    to: inbox,
    subject,
    html,
    replyTo: data.email,
  });

  if (!sent) {
    await messageService.markFailed(note._id, error || "The email was not accepted");
    return { delivered: false };
  }

  await messageService.markSent(note._id, inbox);
  return { delivered: true };
}
