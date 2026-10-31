import { notifyUser, recordActivity } from "../activity/activity.service";

/**
 * Every marketplace notification, in one place.
 *
 * Two audiences: the vendor's own bell and the store team's shared feed. Both
 * swallow their errors — a notification is a side note, so a failed write must
 * never turn a review or an approval into an error the caller sees. The stored
 * `ref` is the id the receiving screen searches for, never a route, so an old
 * line still opens the right page after a rename.
 */

/** One application event for the applicant. */
export async function notifyVendorApplication(params: {
  userId: string;
  title: string;
  detail?: string;
  applicationId: string;
}) {
  await notifyUser({
    userId: params.userId,
    role: "vendor",
    type: "vendor_application",
    title: params.title,
    detail: params.detail || "",
    ref: params.applicationId,
  });
}

/** A new or resubmitted application on the store's board. */
export async function notifyAdminVendorApplication(params: {
  title: string;
  detail?: string;
  applicationId: string;
}) {
  await recordActivity({
    type: "vendor",
    title: params.title,
    detail: params.detail || "",
    ref: params.applicationId,
  });
}

/** A subscription or payment event for the vendor. */
export async function notifyVendorSubscription(params: {
  userId: string;
  title: string;
  detail?: string;
  subscriptionId: string;
  type?: "vendor_subscription" | "vendor_payment";
}) {
  await notifyUser({
    userId: params.userId,
    role: "vendor",
    type: params.type || "vendor_subscription",
    title: params.title,
    detail: params.detail || "",
    ref: params.subscriptionId,
  });
}

/** A subscription event on the store's board. */
export async function notifyAdminVendorSubscription(params: {
  title: string;
  detail?: string;
  subscriptionId: string;
}) {
  await recordActivity({
    type: "vendor",
    title: params.title,
    detail: params.detail || "",
    ref: params.subscriptionId,
  });
}
