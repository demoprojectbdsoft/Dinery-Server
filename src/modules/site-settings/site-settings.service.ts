import { SiteSettings } from "./site-settings.model";

/**
 * Returns the singleton site settings document (creates defaults on first call).
 */
export const getSiteSettings = async () => {
  let settings = await SiteSettings.findOne().lean();
  if (!settings) {
    settings = (await SiteSettings.create({})).toObject();
  }
  return settings;
};

/** First non-empty value, so a blank field in the dashboard falls through. */
function firstAddress(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/**
 * Who the store is, for the emails the API sends: the name and the two inboxes
 * the warranty notifications and the contact page deliver to.
 *
 * The dashboard owns these values, so the owner can change them without a
 * redeploy. The environment variables only fill a gap when a field is empty.
 */
export async function getMailIdentity() {
  const settings: any = await getSiteSettings().catch(() => null);

  const supportInbox = firstAddress(settings?.supportEmail, process.env.STORE_INBOX);
  const contactInbox = firstAddress(
    settings?.contactEmail,
    process.env.CONTACT_INBOX,
    settings?.supportEmail,
    process.env.STORE_INBOX
  );

  return {
    storeName: firstAddress(settings?.siteName, process.env.STORE_NAME, "Sparq"),
    supportInbox,
    contactInbox,
  };
}

/**
 * Merges partial update into the singleton site settings document.
 */
export const updateSiteSettings = async (updates: Record<string, unknown>) => {
  const settings = await SiteSettings.findOneAndUpdate(
    {},
    { $set: updates },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return settings;
};
