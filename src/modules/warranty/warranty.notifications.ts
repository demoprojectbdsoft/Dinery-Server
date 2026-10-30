import { User } from "../user/user.model";
import { Product } from "../product/product.model";
import { Order } from "../order/order.model";
import { sendMail } from "../../utils/mailer";
import {
  claimSubmittedEmail,
  claimUpdatedEmail,
  customMessageEmail,
  warrantyIssuedEmail,
} from "../../utils/emailTemplates";

/**
 * Every email the warranty feature sends.
 *
 * Each helper swallows its own errors: a broken mail setup must never fail a
 * claim, a delivery or an admin action, so the database is always the source of
 * truth and the email is best effort.
 *
 * Who receives what:
 *   claim filed / replied -> the store inbox (STORE_INBOX), reply-to the customer
 *   claim moved by admin  -> the customer
 *   warranty created      -> the customer, one email per covered item
 */

const STORE_NAME = process.env.STORE_NAME || "Sparq";

/** Human wording for the warranty type codes stored on a product. */
const TYPE_LABELS: Record<string, string> = {
  "manufacturer-warranty": "Manufacturer warranty",
  "seller-warranty": "Seller warranty",
  "extended-warranty": "Extended warranty",
  other: "Other warranty",
  none: "No warranty",
};

/** Human wording for the statuses an admin can move a claim to. */
const STATUS_LABELS: Record<string, string> = {
  claim_submitted: "Submitted",
  under_review: "Under review",
  info_requested: "More information needed",
  resolved: "Resolved",
  expired: "Closed",
};

/** One warranty record that delivery created. */
export interface IssuedWarranty {
  productTitle?: string | null;
  warrantyType?: string | null;
  warrantyPeriodMonths?: number | null;
  warrantyTerms?: string | null;
  expiryDate?: Date;
}

/** Store dates in the shop's own timezone, not the server's. */
function formatDate(value?: Date | string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

/** Names and titles an email needs, read fresh so edits are picked up. */
async function loadContext(warranty: any) {
  const [user, product, order] = await Promise.all([
    User.findById(warranty.userId).select("name email").lean(),
    Product.findById(warranty.productId).select("title").lean(),
    Order.findById(warranty.orderId).select("orderNumber").lean(),
  ]);

  return {
    customerName: (user as any)?.name as string | undefined,
    customerEmail: (user as any)?.email as string | undefined,
    productTitle: (product as any)?.title as string | undefined,
    orderNumber: (order as any)?.orderNumber as string | undefined,
  };
}

/** Tells the store inbox that a claim was filed, or answered. */
export async function notifyClaimSubmitted(warranty: any, replyMessage?: string) {
  try {
    const inbox = process.env.STORE_INBOX;
    if (!inbox) {
      console.warn("[warranty] STORE_INBOX is not set, claim email skipped");
      return;
    }

    const context = await loadContext(warranty);
    const { subject, html } = claimSubmittedEmail({
      storeName: STORE_NAME,
      ...context,
      reason: warranty.claimReason || "",
      description: replyMessage || warranty.claimDescription || "",
      images: warranty.claimImages || [],
      isReply: Boolean(replyMessage),
    });

    // Reply-to the customer, so the admin can answer from the inbox directly.
    await sendMail({ to: inbox, subject, html, replyTo: context.customerEmail });
  } catch (err) {
    console.error("[warranty] Claim email failed:", (err as Error).message);
  }
}

/** Tells the customer what the admin decided, including any note or outcome. */
export async function notifyClaimUpdated(warranty: any) {
  try {
    const context = await loadContext(warranty);
    if (!context.customerEmail) {
      console.warn("[warranty] Customer has no email, claim update skipped");
      return;
    }

    const { subject, html } = claimUpdatedEmail({
      storeName: STORE_NAME,
      customerName: context.customerName,
      productTitle: context.productTitle,
      orderNumber: context.orderNumber,
      statusLabel: STATUS_LABELS[warranty.status] || warranty.status,
      adminNote: warranty.claimAdminNote,
      resolution: warranty.resolutionDetails,
    });

    await sendMail({ to: context.customerEmail, subject, html });
  } catch (err) {
    console.error("[warranty] Claim update email failed:", (err as Error).message);
  }
}

/** Confirms freshly created coverage for a delivered order. */
export async function notifyWarrantiesIssued(order: any, issued: IssuedWarranty[]) {
  try {
    if (!issued.length) return;

    const user: any = await User.findById(order.userId).select("name email").lean();
    if (!user?.email) {
      console.warn("[warranty] Customer has no email, warranty confirmation skipped");
      return;
    }

    // One email per covered item, because each item carries its own terms and
    // expiry date.
    for (const item of issued) {
      const { subject, html } = warrantyIssuedEmail({
        storeName: STORE_NAME,
        customerName: user.name,
        productTitle: item.productTitle ?? undefined,
        orderNumber: order.orderNumber,
        typeLabel: item.warrantyType ? TYPE_LABELS[item.warrantyType] : undefined,
        months: item.warrantyPeriodMonths ?? undefined,
        expiryDate: formatDate(item.expiryDate),
        terms: item.warrantyTerms ?? undefined,
      });

      await sendMail({ to: user.email, subject, html });
    }
  } catch (err) {
    console.error("[warranty] Warranty confirmation email failed:", (err as Error).message);
  }
}

/**
 * Sends a message the admin typed in the warranty screen to the customer.
 * The address is read from the warranty record, never from the request body.
 */
export async function sendWarrantyMessage(
  warranty: any,
  subject: string,
  message: string
): Promise<{ sent: boolean; to?: string }> {
  try {
    const context = await loadContext(warranty);
    if (!context.customerEmail) return { sent: false };

    const html = customMessageEmail({
      customerName: context.customerName,
      message,
    });

    const sent = await sendMail({ to: context.customerEmail, subject, html });
    return { sent, to: context.customerEmail };
  } catch (err) {
    console.error("[warranty] Admin message email failed:", (err as Error).message);
    return { sent: false };
  }
}
