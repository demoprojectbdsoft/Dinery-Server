/**
 * Transactional email through Resend's HTTPS API.
 *
 * Two rules keep this safe to call from inside a request:
 *   1. Without `RESEND_API_KEY` and `MAIL_FROM` nothing is sent (local dev works).
 *   2. A failure is reported as `sent: false` with the reason, never thrown, so
 *      saving an order or a claim can never fail because of an email problem.
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

export interface MailResult {
  sent: boolean;
  /** Resend's own reason, shown to the admin so a broken sender is visible. */
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Vercel kills promises left running after the response, so the send is awaited
// with a short timeout rather than fired and forgotten.
const TIMEOUT_MS = 8000;

/** True when the deployment has the two values Resend needs. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/** The message Resend put in its error body, or the whole body if it was plain text. */
async function readReason(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body);
    return parsed?.message || parsed?.error || body;
  } catch {
    return body;
  }
}

/**
 * Turns Resend's answer into something the shop owner can act on.
 *
 * The one error everybody hits first is an unverified sender domain. Resend
 * words it differently per account, so the check stays loose and points at the
 * one thing that fixes it while a domain is still pending.
 */
function explain(status: number, reason: string): string {
  const notVerified =
    status === 403 || /not verified|verify.*domain|domain.*not/i.test(reason);
  if (notVerified) {
    return `${reason} - the domain in MAIL_FROM is not verified on Resend yet.`;
  }
  if (status === 422 && /from/i.test(reason)) {
    return `${reason} - MAIL_FROM must look like "Shop <orders@yourdomain.com>".`;
  }
  return reason || `Resend answered with status ${status}`;
}

export async function sendMail({ to, subject, html, replyTo }: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!apiKey || !from) {
    console.warn("[mail] RESEND_API_KEY or MAIL_FROM is missing, skipped:", subject);
    return { sent: false, error: "RESEND_API_KEY or MAIL_FROM is missing" };
  }
  if (!recipients.length) {
    console.warn("[mail] No recipient address, skipped:", subject);
    return { sent: false, error: "No recipient address" };
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
      const reason = await readReason(res);
      const message = explain(res.status, reason);
      console.error("[mail] Resend rejected the message:", res.status, message);
      return { sent: false, error: message };
    }

    return { sent: true };
  } catch (err) {
    console.error("[mail] Sending failed:", (err as Error).message);
    return { sent: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
