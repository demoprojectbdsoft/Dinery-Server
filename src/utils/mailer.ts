/**
 * Transactional email for the store.
 *
 * There are two ways out, chosen by the environment, so no caller needs to
 * know which one is in use:
 *
 *   1. SMTP — used when `SMTP_USER` and `SMTP_PASS` are set (a Gmail app
 *      password, for example). The message leaves as that real mailbox, so it
 *      reaches any customer without a verified sending domain. This is the
 *      path for a personal Gmail: reliable locally, and on Vercel it depends
 *      on the function finishing the SMTP handshake inside its time limit.
 *   2. Resend over HTTPS — used otherwise. The safe choice for a serverless
 *      host, but Resend only sends from a verified domain (or its own test
 *      address, which reaches nobody but the account owner).
 *
 * Both paths follow the same two rules:
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
    process.env.MAIL_FROM && (isSmtpConfigured() || process.env.RESEND_API_KEY)
  );
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

export async function sendMail(input: MailInput): Promise<MailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  const smtp = isSmtpConfigured();

  if (!process.env.MAIL_FROM) {
    console.warn("[mail] MAIL_FROM is missing, skipped:", input.subject);
    return { sent: false, error: "MAIL_FROM is missing" };
  }
  if (!recipients.length) {
    console.warn("[mail] No recipient address, skipped:", input.subject);
    return { sent: false, error: "No recipient address" };
  }
  if (!smtp && !process.env.RESEND_API_KEY) {
    console.warn("[mail] Neither SMTP nor Resend is configured, skipped:", input.subject);
    return { sent: false, error: "No mail provider is configured" };
  }

  // A configured mailbox wins: it can reach real customers without a domain.
  return smtp ? sendWithSmtp(recipients, input) : sendWithResend(recipients, input);
}
