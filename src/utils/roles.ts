/** Every role the platform knows. "vendor" is reserved for the seller add-on. */
export const ROLES = ["admin", "customer", "rider", "vendor"] as const;

export type UserRole = (typeof ROLES)[number];

/** Lowercases a role so "Admin", "admin" and "ADMIN" all compare equal. */
export const normalizeRole = (role?: string | null) => (role || "").toLowerCase();

/**
 * Admin and demo admin share the same access level — the demo admin is only
 * sandboxed by the undo plugin, not by these checks.
 */
export const isAdminRole = (role?: string | null) => {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "demoadmin";
};

export const isCustomerRole = (role?: string | null) => normalizeRole(role) === "customer";
export const isRiderRole = (role?: string | null) => normalizeRole(role) === "rider";
export const isVendorRole = (role?: string | null) => normalizeRole(role) === "vendor";

/**
 * Roles that manage the shop but never buy from it.
 *
 * A vendor is deliberately absent: an approved seller keeps the same account
 * and may shop from other vendors, so the marketplace tables still accept their
 * cart and wishlist writes.
 */
const NON_SHOPPING_ROLES = ["admin", "demoadmin", "rider"];

/**
 * Only a customer — and now a vendor acting as one — shops. Staff and riders
 * browse the storefront like anybody, but a cart belongs to a buyer, so those
 * writes are refused.
 */
export const canShop = (role?: string | null) => !NON_SHOPPING_ROLES.includes(normalizeRole(role));

/** "Rider", "Demo admin" — how a role reads inside a refusal message. */
export function roleLabel(role?: string | null): string {
  const normalized = normalizeRole(role);
  if (normalized === "demoadmin") return "Demo admin";
  if (!normalized) return "This account";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
