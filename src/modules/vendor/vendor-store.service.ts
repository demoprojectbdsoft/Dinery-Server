import { ApiError } from "../../utils/apiError";
import { VendorStore } from "./vendor-store.model";
import type { UpdateStoreInput } from "./vendor-store.validator";

/**
 * The vendor's own storefront.
 *
 * A vendor reads and edits exactly one row: the one whose `userId` is the
 * signed-in account. The id is never taken from the request, so there is no
 * path through this module that can reach another seller's shop; the admin
 * desk in the marketplace module is the only other writer.
 */

/** Turns the stored row into the shape the dashboard edits. */
export function toStoreDto(store: any) {
  return {
    _id: String(store._id),
    name: store.name || "",
    slug: store.slug || "",
    description: store.description || "",
    logo: store.logo || "",
    coverImage: store.coverImage || "",
    email: store.email || "",
    phone: store.phone || "",
    category: store.category || "",
    website: store.website || "",
    address: {
      country: store.address?.country || "",
      division: store.address?.division || "",
      city: store.address?.city || "",
      area: store.address?.area || "",
      address: store.address?.address || "",
      postalCode: store.address?.postalCode || "",
      latitude: store.address?.latitude ?? null,
      longitude: store.address?.longitude ?? null,
    },
    socialLinks: {
      facebook: store.socialLinks?.facebook || "",
      instagram: store.socialLinks?.instagram || "",
      x: store.socialLinks?.x || "",
      linkedin: store.socialLinks?.linkedin || "",
    },
    status: store.status,
    isVisible: store.isVisible !== false,
    isFeatured: Boolean(store.isFeatured),
    featuredUntil: store.featuredUntil ?? null,
    productCount: Number(store.productCount) || 0,
    reviewCount: Number(store.reviewCount) || 0,
    rating: Number(store.rating) || 0,
    suspendedReason: store.suspendedReason || "",
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}

/** The signed-in vendor's store, or a 404 that names the missing link. */
export async function requireStore(userId: string) {
  const store = await VendorStore.findOne({ userId });
  if (!store) {
    throw new ApiError(404, "No store is linked to this account yet");
  }
  return store;
}

export async function getMyStore(userId: string) {
  return toStoreDto(await requireStore(userId));
}

/** Only the fields the storefront renders are editable; the slug and the
 * counters belong to the platform. */
const EDITABLE_FIELDS = [
  "name",
  "description",
  "logo",
  "coverImage",
  "email",
  "phone",
  "category",
  "website",
  "address",
  "socialLinks",
] as const;

/**
 * An edit of the signed-in vendor's store.
 *
 * Two rules are enforced here rather than in the browser: a closed shop cannot
 * be reopened by its owner, and a suspended shop is forced hidden no matter
 * what the form sent. The slug never changes, because every published link to
 * the store is built from it.
 */
export async function updateMyStore(userId: string, patch: UpdateStoreInput) {
  const store = await requireStore(userId);

  if (store.status === "closed") {
    throw new ApiError(403, "This store is closed. Contact the store team to reopen it.");
  }

  const update: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (patch[field] !== undefined) update[field] = patch[field];
  }

  if (patch.isVisible !== undefined) {
    update.isVisible = store.status === "active" ? patch.isVisible : false;
  }

  if (Object.keys(update).length === 0) {
    throw new ApiError(400, "Nothing to update");
  }

  const updated = await VendorStore.findOneAndUpdate(
    { _id: store._id, userId },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!updated) throw new ApiError(404, "No store is linked to this account yet");
  return toStoreDto(updated);
}

/** The store a public page reads: visible, active and not suspended. */
export async function getVisibleStoreBySlug(slug: string) {
  const store = await VendorStore.findOne({
    slug: slug.trim().toLowerCase(),
    isVisible: true,
    status: "active",
  }).lean();

  if (!store) throw new ApiError(404, "Store not found");
  return toStoreDto(store);
}
