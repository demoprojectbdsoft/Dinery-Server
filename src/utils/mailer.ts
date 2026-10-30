/**
 * Transactional email for the store.
 *
 * There are three ways out, picked by whichever credentials exist:
 *
 *   1. Brevo (HTTPS) - `BREVO_API_KEY`. Needs only a verified **sender address**,
 *      not a domain, and its dashboard keeps a delivery log for every message.
 *   2. SMTP - `SMTP_USER` + `SMTP_PASS` (a Gmail app password, for example).
 *      The message leaves as that real mailbox, so it reaches any customer.
 *      Reliable locally; on a serverless host it depends on the function
 *      finishing the SMTP handshake in time.
 *   3. Resend (HTTPS) - `RESEND_API_KEY`. The safe serverless path, but it only
 *      sends from a verified domain (or its own test address, which reaches
 *      nobody but the account owner).
 *
 * Whichever is used, two rules hold:
 *   1. Nothing is sent when no sender is configured, so local dev stays quiet.
 *   2. A failure comes back as `sent: false` with the reason and is never
 *      thrown, so placing an order or filing a claim can never fail because of
 *      an email problem.
 */

import nodemailer, { Transporter } from "nodemailer";

export interface MailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Where a reply should land, so admins can answer from their own inbox. */
  replyTo?: string;
}

export interface MailResult {
  sent: boolean;
  /** The provider's own reason, shown to the admin so a broken sender is visible. */
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
// Vercel kills promises left running after the response, so every network step
// gets a short budget instead of being fired and forgotten.
const TIMEOUT_MS = 8000;

/** True when a mailbox login is available. */
function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** True when the deployment can send email at all. */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.MAIL_FROM &&
      (process.env.BREVO_API_KEY || isSmtpConfigured() || process.env.RESEND_API_KEY)
  );
}

/**
 * Splits `Sparq <orders@shop.com>` into a name and an address.
 *
 * Brevo wants the two parts separately, while Resend and SMTP take `MAIL_FROM`
 * as it is written.
 */
function parseFrom(value: string): { name?: string; email: string } {
  const match = value.match(/^(.*)<(.+)>$/);
  if (!match) return { email: value.trim() };

  const name = match[1].trim().replace(/^"|"$/g, "");
  return { name: name || undefined, email: match[2].trim() };
}

/**
 * One transporter for the whole process. It is not pooled, so it costs nothing
 * to keep, and reusing it saves setting up the connection options per email.
 */
let transporter: Transporter | null = null;

function smtpTransporter(): Transporter {
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    // Port 465 is encrypted from the first byte, 587 upgrades with STARTTLS.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  return transporter;
}

/** Turns an SMTP failure into an instruction the shop owner can act on. */
function explainSmtp(err: {
  code?: string;
  responseCode?: number;
  message?: string;
}): string {
  const message = err.message || "unknown error";

  if (err.responseCode === 535 || err.code === "EAUTH") {
    return `The mail server rejected the login (${message}). SMTP_PASS must be a 16-character app password, not the account password.`;
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return `The mail server could not be reached (${message}). Many hosts block outgoing SMTP - fall back to a domain verified with Resend.`;
  }
  return message;
}

async function sendWithSmtp(recipients: string[], input: MailInput): Promise<MailResult> {
  try {
    const info = await smtpTransporter().sendMail({
      from: process.env.MAIL_FROM,
      to: recipients.join(", "),
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });

    // The server can accept the connection and still refuse every recipient.
    if (!info.accepted?.length) {
      return {
        sent: false,
        error: `The mail server accepted no recipient (${recipients.join(", ")})`,
      };
    }

    return { sent: true };
  } catch (err) {
    const message = explainSmtp(err as { code?: string; responseCode?: number; message?: string });
    console.error("[mail] SMTP sending failed:", message);
    return { sent: false, error: message };
  }
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
function explainResend(status: number, reason: string): string {
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

async function sendWithResend(recipients: string[], input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY as string;
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
        from: process.env.MAIL_FROM,
        to: recipients,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = explainResend(res.status, await readReason(res));
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

/** Turns Brevo's answer into something the shop owner can act on. */
function explainBrevo(status: number, reason: string): string {
  if (status === 401 || status === 403) {
    return `Brevo refused the API key (${reason}). Copy it again from Brevo -> SMTP & API -> API keys.`;
  }
  if (/sender|from address/i.test(reason)) {
    return `${reason} - add and confirm that address under Brevo -> Senders & Domains.`;
  }
  return reason || `Brevo answered with status ${status}`;
}

async function sendWithBrevo(recipients: string[], input: MailInput): Promise<MailResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY as string,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseFrom(process.env.MAIL_FROM as string),
        to: recipients.map((email) => ({ email })),
        subject: input.subject,
        htmlContent: input.html,
        ...(input.replyTo ? { replyTo: { email: input.replyTo } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const message = explainBrevo(res.status, await readReason(res));
      console.error("[mail] Brevo rejected the message:", res.status, message);
      return { sent: false, error: message };
    }

    return { sent: true };
  } catch (err) {
    console.error("[mail] Brevo sending failed:", (err as Error).message);
    return { sent: false, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  const brevo = Boolean(process.env.BREVO_API_KEY);
  const smtp = isSmtpConfigured();

  if (!process.env.MAIL_FROM) {
    console.warn("[mail] MAIL_FROM is missing, skipped:", input.subject);
    return { sent: false, error: "MAIL_FROM is missing" };
  }
  if (!recipients.length) {
    console.warn("[mail] No recipient address, skipped:", input.subject);
    return { sent: false, error: "No recipient address" };
  }
  if (!brevo && !smtp && !process.env.RESEND_API_KEY) {
    console.warn("[mail] No mail provider is configured, skipped:", input.subject);
    return { sent: false, error: "No mail provider is configured" };
  }

  // First configured transport wins: Brevo, then a mailbox, then Resend.
  if (brevo) return sendWithBrevo(recipients, input);
  if (smtp) return sendWithSmtp(recipients, input);
  return sendWithResend(recipients, input);
}
