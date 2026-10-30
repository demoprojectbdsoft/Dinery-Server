import { z } from "zod";

/**
 * The rules are deliberately the same as the checkout form's: anything the
 * customer is allowed to save is also deliverable on an order.
 *
 * `.trim()` runs before `.min()`, so a field made only of spaces is rejected
 * instead of being stored as an almost-empty string.
 */
export const saveAddressSchema = z.object({
  label: z.string().trim().max(40, "Label is too long").optional().default("Home"),
  fullName: z.string().trim().min(2, "Enter the recipient's full name").max(100, "Full name is too long"),
  phone: z.string().trim().min(6, "Enter a contact phone number").max(30, "Phone number is too long"),
  address: z.string().trim().min(3, "Enter the street address").max(300, "Address is too long"),
  city: z.string().trim().min(2, "Enter the city or district").max(100, "City is too long"),
  postalCode: z.string().trim().min(2, "Enter the postal code").max(20, "Postal code is too long"),
  isDefault: z.boolean().optional().default(false),
});

/**
 * An edit may fix any of the address fields. `isDefault` is left out on
 * purpose: the default is switched through its own endpoint, so an edit can
 * never leave the customer with no default address at all.
 */
export const updateAddressSchema = saveAddressSchema.omit({ isDefault: true }).partial();

export type SaveAddressInput = z.infer<typeof saveAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
