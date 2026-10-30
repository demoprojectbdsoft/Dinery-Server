/**
 * The email bodies the store sends. Kept as plain strings on purpose: a few
 * short messages do not need a template engine, and every value is escaped so a
 * customer's own words can never break the HTML.
 *
 * Colours, logo and typeface come from Site Settings (`getMailIdentity()`), so
 * the owner rebrands the shop in the dashboard and every email follows. What is
 * drawn here stays inside what mail clients really render: nested divs, inline
 * styles and solid colours — no flexbox, no stylesheets, no background images.
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

/**
 * What an email needs to look like the shop. Built once per send from Site
 * Settings, so a colour change needs no redeploy.
 */
export interface MailBrand {
  storeName: string;
  /** Logo image, shown above the heading when one is uploaded. */
  logoUrl?: string;
  /** The palette's primary colour: the top rule, buttons and links. */
  primary: string;
  /** A darker shade of the same colour, used for the heading text. */
  primaryDark: string;
  /** A thin highlight rule under the header. */
  accent: string;
  /** Page background behind the white card. */
  surface: string;
  /** Font stack. Web fonts do not load in mail, so this is a fallback stack. */
  fontFamily: string;
  supportEmail?: string;
  supportPhone?: string;
  /** Shop address, used to build the "view your order" links. */
  siteUrl?: string;
}

/** Used when Site Settings cannot be read, so an email is never left unstyled. */
export const DEFAULT_BRAND: MailBrand = {
  storeName: "Sparq",
  primary: "#0284c7",
  primaryDark: "#0369a1",
  accent: "#f59e0b",
  surface: "#f6f7f9",
  fontFamily: "Arial, Helvetica, sans-serif",
};

/** Link to the customer's own orders, where claims and coverage live. */
function ordersUrl(brand?: MailBrand): string {
  const base = (brand?.siteUrl || "").replace(/\/+$/, "");
  return base ? `${base}/dashboard/customer/orders` : "";
}

/** Link to the admin warranty screen, used by the emails sent to the store. */
function adminWarrantiesUrl(brand?: MailBrand): string {
  const base = (brand?.siteUrl || "").replace(/\/+$/, "");
  return base ? `${base}/dashboard/admin/warranties` : "";
}

/**
 * One button. Drawn as a link on a coloured block, because a real <button>
 * does nothing in a mail client.
 */
function button(label: string, href: string, brand: MailBrand): string {
  if (!href) return "";
  return `<p style="margin:22px 0 0">
        <a href="${esc(href)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:${esc(
          brand.primary
        )};color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">${esc(
          label
        )}</a>
      </p>`;
}

interface LayoutOptions {
  brand?: MailBrand;
  /** Optional call-to-action at the bottom of the body. */
  actionLabel?: string;
  actionHref?: string;
}

/**
 * Shared frame: a brand rule, the logo and heading, the body, one button, and a
 * quiet footer that says who sent it and how to reach them.
 */
function layout(heading: string, body: string, options: LayoutOptions = {}): string {
  const brand = options.brand || DEFAULT_BRAND;

  // Mail clients need an explicit size; a missing logo simply leaves no image.
  const logo = brand.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(
        brand.storeName
      )}" style="height:32px;max-width:200px;display:block;margin:0 0 14px;border:0">`
    : "";

  // Both halves of the footer are optional, so a half-filled Site Settings
  // record never prints a stray dot.
  const contact = [brand.supportEmail, brand.supportPhone]
    .filter((value) => Boolean(value))
    .map((value) => esc(value))
    .join(" &middot; ");

  return `
  <div style="margin:0;padding:24px;background:${esc(brand.surface)};font-family:${esc(
    brand.fontFamily
  )}">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="height:4px;background:${esc(brand.primary)}"></div>
      <div style="padding:20px 24px;border-bottom:3px solid ${esc(brand.accent)}">
        ${logo}
        <h1 style="margin:0;font-size:18px;line-height:1.3;color:${esc(
          brand.primaryDark
        )}">${esc(heading)}</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">${esc(brand.storeName)}</p>
      </div>
      <div style="padding:24px;font-size:14px;line-height:1.6;color:#374151">${body}${button(
        options.actionLabel || "",
        options.actionHref || "",
        brand
      )}</div>
      <div style="padding:16px 24px;border-top:1px solid #eef1f4;font-size:12px;line-height:1.6;color:#6b7280">
        ${contact ? `<p style="margin:0 0 6px">${contact}</p>` : ""}
        <p style="margin:0">This message was sent automatically by ${esc(
          brand.storeName
        )}. Please do not reply to the sender address if your mail app asks you to choose one.</p>
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
  /** Site Settings colours and logo. Falls back to DEFAULT_BRAND. */
  brand?: MailBrand;
  customerName?: string;
  customerEmail?: string;
  orderNumber?: string;
  productTitle?: string;
  reason: string;
  description: string;
  images?: string[];
}

export function claimSubmittedEmail(data: ClaimSubmittedMailInput) {
  const heading = `New warranty claim — ${data.storeName}`;

  const images = (data.images || [])
    .map(
      (url) =>
        `<li><a href="${esc(url)}" style="color:${esc(
          data.brand?.primary || DEFAULT_BRAND.primary
        )}">${esc(url)}</a></li>`
    )
    .join("");

  const body = `
    <p style="margin:0 0 14px">A customer submitted a warranty claim.</p>
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
    <p style="margin:0">Open the admin dashboard to review or resolve the claim.</p>`;

  return {
    subject: heading,
    html: layout(heading, body, {
      brand: data.brand,
      actionLabel: "Open the warranty dashboard",
      actionHref: adminWarrantiesUrl(data.brand),
    }),
  };
}

/* ── 2. An admin moved the claim, so the customer is told what happens next ── */

export interface ClaimUpdatedMailInput {
  storeName: string;
  brand?: MailBrand;
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

  return {
    subject,
    html: layout(subject, body, {
      brand: data.brand,
      actionLabel: "View your orders",
      actionHref: ordersUrl(data.brand),
    }),
  };
}

/* ── 3. Delivery created the coverage, so the customer gets it in writing ── */

export interface WarrantyIssuedMailInput {
  storeName: string;
  brand?: MailBrand;
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

  return {
    subject,
    html: layout(subject, body, {
      brand: data.brand,
      actionLabel: "View your warranty",
      actionHref: ordersUrl(data.brand),
    }),
  };
}

/* ── 4. An admin writes to the customer by hand about a warranty ── */

export interface CustomMessageMailInput {
  brand?: MailBrand;
  customerName?: string;
  message: string;
}

/**
 * Wraps a message an admin typed in the warranty screen. The subject is chosen
 * by the admin, so only the body is built here.
 */
export function customMessageEmail(data: CustomMessageMailInput): string {
  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.customerName || "there")},</p>
    <div style="margin:0 0 14px;white-space:pre-line">${esc(data.message)}</div>`;

  return layout("A message about your warranty", body, {
    brand: data.brand,
    actionLabel: "View your warranty",
    actionHref: ordersUrl(data.brand),
  });
}

/* ── 5. The admin answers a contact message from the dashboard ── */

export interface VisitorReplyMailInput {
  brand?: MailBrand;
  visitorName?: string;
  message: string;
}

/**
 * Wraps a reply an admin typed on the messages screen. The visitor's own subject
 * and words are already stored, so only the answer is drawn here.
 */
export function visitorReplyEmail(data: VisitorReplyMailInput): string {
  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.visitorName || "there")},</p>
    <div style="margin:0 0 14px;white-space:pre-line">${esc(data.message)}</div>`;

  // The storefront, so the visitor can pick up where they left off.
  const base = (data.brand?.siteUrl || "").replace(/\/+$/, "");

  return layout("A reply to your message", body, {
    brand: data.brand,
    actionLabel: "Visit the store",
    actionHref: base,
  });
}

/* ── 6. A visitor wrote from the contact page, so the inbox gets the details ── */

export interface ContactMessageMailInput {
  storeName: string;
  brand?: MailBrand;
  name: string;
  email: string;
  department: "support" | "contact";
  subject: string;
  message: string;
}

export function contactMessageEmail(data: ContactMessageMailInput) {
  const department = data.department === "contact" ? "General & Business" : "Customer Support";

  // A subject is one line, so a newline typed into a name can never split it.
  const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
  const visitorName = oneLine(data.name) || "a visitor";

  // The department goes in the subject so the inbox can filter on it, and the
  // visitor's own subject is kept when they wrote one.
  const subject = `[${department}] ${
    oneLine(data.subject) || `New message from ${visitorName}`
  }`;

  const body = `
    <p style="margin:0 0 14px">A visitor sent this message from the ${esc(
      data.storeName
    )} contact page.</p>
    ${row("Name", data.name)}
    ${row("Email", data.email)}
    ${row("Department", department)}
    ${row("Subject", data.subject)}
    <p style="margin:14px 0 6px"><strong>Message</strong></p>
    <p style="margin:0 0 14px;white-space:pre-line;background:#f9fafb;border:1px solid #eef1f4;border-radius:8px;padding:12px">${esc(
      data.message
    )}</p>
    <p style="margin:0">Reply to this email to answer the visitor directly.</p>`;

  // No button here: the reply happens in the inbox, not on a web page.
  return { subject, html: layout(subject, body, { brand: data.brand }) };
}

/* ── 7. An admin added months to a warranty, so the customer is told ── */

export interface WarrantyExtendedMailInput {
  storeName: string;
  brand?: MailBrand;
  customerName?: string;
  productTitle?: string;
  orderNumber?: string;
  typeLabel?: string;
  months: number;
  previousExpiryDate: string;
  newExpiryDate: string;
  reason: string;
}

export function warrantyExtendedEmail(data: WarrantyExtendedMailInput) {
  const item = data.productTitle || `order ${data.orderNumber || ""}`.trim();
  const subject = `Warranty extended for ${item} — ${data.storeName}`;
  const months = `${data.months} month${data.months === 1 ? "" : "s"}`;

  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.customerName || "there")},</p>
    <p style="margin:0 0 14px">We have extended the warranty on <strong>${esc(
      item
    )}</strong> by <strong>${esc(months)}</strong>. Nothing is needed from you — the same claim form is used, and it will accept claims until the new date.</p>
    ${row("Warranty type", data.typeLabel)}
    ${row("Order number", data.orderNumber)}
    ${row("Previous expiry", data.previousExpiryDate)}
    ${row("New expiry", data.newExpiryDate)}
    ${row("Extra cover", months)}
    ${row("Reason", data.reason)}
    <p style="margin:0">You can check this at any time under My Account → Orders → Warranty.</p>`;

  return {
    subject,
    html: layout(subject, body, {
      brand: data.brand,
      actionLabel: "View your warranty",
      actionHref: ordersUrl(data.brand),
    }),
  };
}

/* ── 8. A customer asked for a password reset link ── */

export interface PasswordResetMailInput {
  brand?: MailBrand;
  customerName?: string;
  /** The one-time link better-auth built, with the token already inside it. */
  url: string;
}

/**
 * The email behind "Forgot password".
 *
 * The link is not built here: better-auth owns the token, so the URL arrives
 * ready to use and is only placed inside the button.
 */
export function passwordResetEmail(data: PasswordResetMailInput) {
  const storeName = data.brand?.storeName || DEFAULT_BRAND.storeName;
  const subject = `Reset your ${storeName} password`;

  const body = `
    <p style="margin:0 0 14px">Hello ${esc(data.customerName || "there")},</p>
    <p style="margin:0 0 14px">Someone asked to reset the password for this account. Use the button below to choose a new one.</p>
    <p style="margin:0 0 14px">The link works once and stops working after one hour.</p>
    <p style="margin:0">If you did not ask for this, nothing has changed — your current password still works, and you can ignore this email.</p>`;

  return {
    subject,
    html: layout("Reset your password", body, {
      brand: data.brand,
      actionLabel: "Choose a new password",
      actionHref: data.url,
    }),
  };
}
