/**
 * Transactional email for the store.
 *
 * There is one way out: SMTP, logging in as the mailbox in `SMTP_USER`. The
 * message leaves as that real address, so it reaches any customer and needs no
 * domain to verify - only an app password from that same mailbox.
 *
 * Two rules hold:
 *   1. Nothing is sent when the sender or the mailbox is missing, so local dev
 *      stays quiet.
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
  /** The mail server's own reason, shown to the admin so a broken setup is visible. */
  error?: string;
}

// A serverless host cuts off promises left running after the response, so every
// connection step gets a short budget instead of hanging.
const TIMEOUT_MS = 8000;

/** True when a mailbox login is available. */
function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** True when the deployment can send email at all. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.MAIL_FROM && isSmtpConfigured());
}

/**
 * `Sparq <orders@shop.com>` -> `orders@shop.com`.
 *
 * Only used to check the sender: `Sparq <sparq.bdsoft.org>` reads like an
 * address but holds no mailbox, and the mail server answers that with a vague
 * "invalid sender" that points at nothing.
 */
function senderAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
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
  if (/from address|not owned|sender address/i.test(message)) {
    return `${message} - MAIL_FROM must be the same mailbox you log in with (SMTP_USER).`;
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return `The mail server could not be reached (${message}). Check SMTP_HOST and SMTP_PORT, and whether this host allows outgoing SMTP.`;
  }
  return message;
}

/**
 * Sends one message over SMTP.
 *
 * `from` is passed exactly as `MAIL_FROM` is written, so the display name
 * survives: `Sparq <orders@shop.com>` arrives as "Sparq", not as a bare address.
 */
async function sendOverSmtp(recipients: string[], input: MailInput): Promise<MailResult> {
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

export async function sendMail(input: MailInput): Promise<MailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);

  if (!process.env.MAIL_FROM) {
    console.warn("[mail] MAIL_FROM is missing, skipped:", input.subject);
    return { sent: false, error: "MAIL_FROM is missing" };
  }
  // Caught here because a bare domain looks plausible in the .env file and the
  // mail server only answers "invalid sender".
  if (!senderAddress(process.env.MAIL_FROM).includes("@")) {
    const error = `MAIL_FROM must hold a full address like "Sparq <you@gmail.com>", but it is "${process.env.MAIL_FROM}".`;
    console.error("[mail]", error);
    return { sent: false, error };
  }
  if (!recipients.length) {
    console.warn("[mail] No recipient address, skipped:", input.subject);
    return { sent: false, error: "No recipient address" };
  }
  if (!isSmtpConfigured()) {
    console.warn("[mail] SMTP_USER and SMTP_PASS are missing, skipped:", input.subject);
    return { sent: false, error: "SMTP is not configured: set SMTP_USER and SMTP_PASS" };
  }

  return sendOverSmtp(recipients, input);
}
