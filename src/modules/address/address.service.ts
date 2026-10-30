import { Types } from "mongoose";
import { Address } from "./address.model";
import { ApiError } from "../../utils/apiError";
import { SaveAddressInput, UpdateAddressInput } from "./address.validator";

/** How many addresses one customer may keep. Keeps the checkout picker short. */
export const MAX_SAVED_ADDRESSES = 5;

/** Lower-cases and collapses spaces so "Road 11" and "road  11" count as one. */
function normalize(value: string): string {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when two addresses lead to the same doorstep. */
function sameAddress(
  a: { address: string; city: string; postalCode: string },
  b: { address: string; city: string; postalCode: string }
): boolean {
  return (
    normalize(a.address) === normalize(b.address) &&
    normalize(a.city) === normalize(b.city) &&
    normalize(a.postalCode) === normalize(b.postalCode)
  );
}

/** A malformed id would otherwise reach Mongo and end as a 500 instead of a 404. */
function assertValidId(id: string): void {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "Address not found");
}

/** The customer's addresses, default first and then the newest. */
export async function getAddresses(userId: string) {
  return Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
}

/**
 * Marks one address as the default and clears the flag on all the others.
 *
 * A customer may have five addresses but only one default, so checkout always
 * has a single address to preselect.
 */
async function makeDefault(userId: string, addressId: Types.ObjectId | string): Promise<void> {
  await Address.updateMany({ userId }, { isDefault: false });
  await Address.updateOne({ _id: addressId, userId }, { isDefault: true });
}

/**
 * Stores an address. Returns `created: false` when the very same address is
 * already saved — ordering twice from home should not leave two copies behind.
 */
export async function saveAddress(userId: string, data: SaveAddressInput) {
  const saved = await Address.find({ userId }).sort({ createdAt: -1 });

  const duplicate = saved.find((item) => sameAddress(item, data));
  if (duplicate) return { address: duplicate, created: false };

  if (saved.length >= MAX_SAVED_ADDRESSES) {
    throw new ApiError(
      400,
      `You can keep up to ${MAX_SAVED_ADDRESSES} saved addresses. Remove one before saving another.`
    );
  }

  // The first address is always the default, so the next checkout can
  // preselect it without the customer doing anything.
  const isDefault = data.isDefault || saved.length === 0;

  const address = await Address.create({
    userId,
    label: data.label || "Home",
    fullName: data.fullName,
    phone: data.phone,
    address: data.address,
    city: data.city,
    postalCode: data.postalCode,
    isDefault,
  });

  if (isDefault) await makeDefault(userId, address._id);

  return { address, created: true };
}

/** Edits one of the caller's addresses. `userId` in the filter is the guard. */
export async function updateAddress(userId: string, id: string, data: UpdateAddressInput) {
  assertValidId(id);

  const address = await Address.findOneAndUpdate(
    { _id: id, userId },
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!address) throw new ApiError(404, "Address not found");

  return address;
}

/**
 * Removes an address. If it was the default, the newest remaining one takes
 * over so the account is never left with addresses but no default.
 */
export async function removeAddress(userId: string, id: string) {
  assertValidId(id);

  const removed = await Address.findOneAndDelete({ _id: id, userId });
  if (!removed) throw new ApiError(404, "Address not found");

  if (removed.isDefault) {
    const next = await Address.findOne({ userId }).sort({ createdAt: -1 });
    if (next) await makeDefault(userId, next._id);
  }

  return removed;
}

/** Makes one address the default. */
export async function setDefaultAddress(userId: string, id: string) {
  assertValidId(id);

  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw new ApiError(404, "Address not found");

  await makeDefault(userId, address._id);
  return Address.findById(address._id);
}
