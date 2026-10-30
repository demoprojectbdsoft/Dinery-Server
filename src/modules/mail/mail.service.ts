import { ApiError } from "../../utils/apiError";
import { sendMail } from "../../utils/mailer";
import { passwordResetEmail } from "../../utils/emailTemplates";
import { getMailIdentity } from "../site-settings/site-settings.service";
import { ResetPasswordMailInput } from "./mail.validator";

/**
 * Sends the "Reset your password" email for the storefront.
 *
 * The storefront owns the token, so it passes the finished link; this side owns
 * the mailbox, the template and the branding. A failure is reported as an
 * error, unlike an order email: the customer is waiting for this message and
 * must be told when it did not go out.
 */
export async function sendPasswordResetMail(data: ResetPasswordMailInput): Promise<void> {
  const { brand } = await getMailIdentity();

  const { subject, html } = passwordResetEmail({
    brand,
    customerName: data.name,
    url: data.url,
  });

  const { sent, error } = await sendMail({ to: data.email, subject, html });

  if (!sent) {
    throw new ApiError(
      502,
      error
        ? `The reset email could not be sent: ${error}`
        : "The reset email could not be sent. Check the mail settings and try again."
    );
  }
}
