/**
 * The email bodies the store sends. Kept as plain strings on purpose: three
 * short messages do not need a template engine, and every value is escaped so a
 * customer's own words can never break the HTML.
 */

/** Customer text goes into HTML, so angle brackets and quotes are neutralised. */
function esc(value?: string | number | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared frame: heading, body, and a quiet footer. */
function layout(heading: string, body: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f6f7f9;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="padding:20px 24px;border-bottom:1px solid #eef1f4">
        <h1 style="margin:0;font-size:18px;color:#111827">${esc(heading)}</h1>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.6;color:#374151">${body}</div>
      <div style="padding:16px 24px;border-top:1px solid #eef1f4;font-size:12px;color:#6b7280">
        This message was sent automatically by the store. Please do not reply to the
        sender address if your mail app asks you to choose one.
      </div>
    </div>
  </div>`;
}

/** A small label/value block used by every template. */
function row(label: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "";
  return `<p style="margin:0 0 6px"><strong>${esc(label)}:</strong> ${esc(value)}</p>`;
}

/* ── 1. A customer filed a claim, so the store inbox needs the details ── */

export interface ClaimSubmittedMailInput {
  storeName: string;
  customerName?: string;
  customerEmail?: string;
  orderNumber?: string;
  productTitle?: string;
  reason: string;
  description: string;
  images?: string[];
  isReply?: boolean;
}

export function claimSubmittedEmail(data: ClaimSubmittedMailInput) {
  const heading = data.isReply
    ? `New reply on a warranty claim — ${data.storeName}`
    : `New warranty claim — ${data.storeName}`;

  const images = (data.images || [])
    .map(
      (url) =>
        `<li><a href="${esc(url)}" style="color:#2563eb">${esc(url)}</a></li>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 14px">${
      data.isReply
        ? "The customer answered your request for more information."
        : "A customer submitted a warranty claim."
    }</p>
    ${row("Customer", data.customerName || "Customer")}
    ${row("Email", data.customerEmail || "—")}
    ${row("Order", data.orderNumber)}
    ${row("Product", data.productTitle)}
    ${row("Reason", data.reason)}
    <p style="margin:14px 0 6px"><strong>Description</strong></p>
    <p style="margin:0 0 14px;white-space:pre-line;background:#f9fafb;border:1px solid #eef1f4;border-radius:8px;padding:12px">${esc(
      data.description
    )}</p>
    ${images ? `<p style="margin:0 0 6px"><strong>Photos</strong></p><ul style="margin:0 0 14px">${images}</ul>` : ""}
    <p style="margin:0">Open the admin dashboard to review, ask for more information, or resolve the claim.</p>`;

  return { subject: heading, html: layout(heading, body) };
}

/* ── 2. An admin moved the claim, so the customer is told what happens next ── */

export interface ClaimUpdatedMailInput {
  storeName: string;
  customerName?: string;
  productTitle?: string;
  orderNumber?: string;
  statusLabel: string;
  adminNote?: string;
  resolution?: string;
}

export function claimUpdatedEmail(data: ClaimUpdatedMailInput) {
  const subject = `Update on your warranty claim — ${data.storeName}`;

  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.customerName || "there")},</p>
    <p style="margin:0 0 14px">Your warranty claim status is now <strong>${esc(
      data.statusLabel
    )}</strong>.</p>
    ${row("Product", data.productTitle)}
    ${row("Order", data.orderNumber)}
    ${
      data.adminNote
        ? `<p style="margin:14px 0 6px"><strong>Message from the store</strong></p>
           <p style="margin:0 0 14px;white-space:pre-line;background:#f9fafb;border:1px solid #eef1f4;border-radius:8px;padding:12px">${esc(
             data.adminNote
           )}</p>`
        : ""
    }
    ${
      data.resolution
        ? `<p style="margin:14px 0 6px"><strong>Resolution</strong></p>
           <p style="margin:0 0 14px;white-space:pre-line;background:#ecfdf5;border:1px solid #d1fae5;border-radius:8px;padding:12px">${esc(
             data.resolution
           )}</p>`
        : ""
    }
    <p style="margin:0">You can follow the claim from your orders page in your account.</p>`;

  return { subject, html: layout(subject, body) };
}

/* ── 3. Delivery created the coverage, so the customer gets it in writing ── */

export interface WarrantyIssuedMailInput {
  storeName: string;
  customerName?: string;
  productTitle?: string;
  orderNumber?: string;
  typeLabel?: string;
  months?: number;
  expiryDate?: string;
  terms?: string;
}

export function warrantyIssuedEmail(data: WarrantyIssuedMailInput) {
  const subject = `Your warranty is active — ${data.storeName}`;

  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.customerName || "there")},</p>
    <p style="margin:0 0 14px">Your order was delivered, so the warranty below is now active.</p>
    ${row("Product", data.productTitle)}
    ${row("Order", data.orderNumber)}
    ${row("Type", data.typeLabel)}
    ${row("Covered for", data.months ? `${data.months} month${data.months === 1 ? "" : "s"}` : "")}
    ${row("Valid until", data.expiryDate)}
    ${
      data.terms
        ? `<p style="margin:14px 0 6px"><strong>What is covered</strong></p>
           <p style="margin:0 0 14px;white-space:pre-line;background:#f9fafb;border:1px solid #eef1f4;border-radius:8px;padding:12px">${esc(
             data.terms
           )}</p>`
        : ""
    }
    <p style="margin:0">If the product develops a problem, open the order in your account and use the claim form.</p>`;

  return { subject, html: layout(subject, body) };
}
