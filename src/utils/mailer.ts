/**
 * Transactional email through Resend's HTTPS API.
 *
 * Two rules keep this safe to call from inside a request:
 *   1. Without `RESEND_API_KEY` and `MAIL_FROM` nothing is sent (local dev works).
 *   2. A failure is logged and reported as `false`, never thrown, so saving an
 *      order or a claim can never fail because of an email problem.
 *
 * Resend is called over HTTPS instead of SMTP because the API runs as a Vercel
 * serverless function, where long-lived SMTP connections are not available.
 */

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Where a reply should land, so admins can answer from their own inbox. */
  replyTo?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Vercel kills promises left running after the response, so the send is awaited
// with a short timeout rather than fired and forgotten.
const TIMEOUT_MS = 8000;

/** True when the deployment has the two values Resend needs. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, html, replyTo }: MailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!apiKey || !from) {
    console.warn("[mail] RESEND_API_KEY or MAIL_FROM is missing, skipped:", subject);
    return false;
  }
  if (!recipients.length) {
    console.warn("[mail] No recipient address, skipped:", subject);
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[mail] Resend rejected the message:", res.status, detail);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[mail] Sending failed:", (err as Error).message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
