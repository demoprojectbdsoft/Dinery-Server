import { notifyUser, recordActivity } from "../activity/activity.service";

/**
 * Every rider-side notification, in one place.
 *
 * Two audiences: the applicant's own bell and the store team's shared feed.
 * Both swallow their errors, because a notification is a side note — a failed
 * write must never turn a completed review into an error the reviewer sees.
 */

export async function notifyRiderApplication(params: {
  userId: string;
  title: string;
  detail?: string;
  applicationId: string;
}) {
  await notifyUser({
    userId: params.userId,
    role: "rider",
    type: "rider_application",
    title: params.title,
    detail: params.detail || "",
    ref: params.applicationId,
  });
}

export async function notifyAdminRiderApplication(params: {
  title: string;
  detail?: string;
  applicationId: string;
}) {
  await recordActivity({
    type: "rider",
    title: params.title,
    detail: params.detail || "",
    ref: params.applicationId,
  });
}
