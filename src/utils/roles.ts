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
 * Roles that never shop on their own.
 *
 * The strict multi-role rule is enforced through `canShopWithRoles`, which
 * requires `customer` to appear in the approved array. This list is the
 * fallback path for accounts whose `roles` field is still empty — a row the
 * migration has not reached yet. A legacy `vendor` used to be able to shop
 * through the single-role check; the migration adds `customer` alongside
 * `vendor` before that path is exercised again, so shopping continues to work
 * for approved sellers without weakening the new rule.
 */
const NON_SHOPPING_ROLES = ["admin", "demoadmin", "rider", "vendor"];

/**
 * Only a customer shops. Admins, riders and vendors are refused at the API
 * boundary; the storefront hides the buttons for them as well, but a request
 * can always be replayed, so the rule is enforced here too.
 *
 * The multi-role entry point is `canShopWithRoles` — this helper is only the
 * fallback for rows the migration has not populated yet.
 */
export const canShop = (role?: string | null) => !NON_SHOPPING_ROLES.includes(normalizeRole(role));

/** "Rider", "Demo admin" — how a role reads inside a refusal message. */
export function roleLabel(role?: string | null): string {
  const normalized = normalizeRole(role);
  if (normalized === "demoadmin") return "Demo admin";
  if (!normalized) return "This account";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Normalises the many shapes an approved-role list arrives in.
 *
 * A legacy row only carries `role`, a fresh row carries `roles: [String]`, and
 * the auth middleware may hand us either — including `undefined` when the DB
 * read failed. Everything collapses to a lowercase, de-duplicated array so the
 * checks below never have to think about it.
 */
export function normalizeRoles(input?: unknown): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  const seen = new Set<string>();
  for (const raw of list) {
    const value = normalizeRole(typeof raw === "string" ? raw : null);
    if (value) seen.add(value);
  }
  return Array.from(seen);
}

/**
 * True when the caller holds one of `allowed` as an approved role.
 *
 * `active` alone is not enough — the whole point of the array is that a
 * client-supplied dashboard choice never grants authority by itself. Legacy
 * callers that still pass a bare `role` string (a single value) are treated as
 * if that value were the only entry in their approved list.
 */
export function hasAnyRole(
  roles: unknown,
  allowed: readonly string[],
  legacyRole?: string | null
): boolean {
  const list = normalizeRoles(roles);
  // A row that predates the multi-role schema only has `role`. Trust it, but
  // only for the singular legacy path — anything written after the migration
  // fills the array first.
  const pool = list.length > 0 ? list : normalizeRoles(legacyRole);
  const wanted = allowed.map(normalizeRole);
  return wanted.some((role) => pool.includes(role));
}

/**
 * Whether the caller may shop, given every role they hold.
 *
 * Only the `customer` entry in the approved array unlocks the cart and the
 * wishlist. A rider or a vendor who never had `customer` — a legacy row that
 * predates the migration, or an account granted authority directly — is
 * refused. This is deliberate: it keeps a delivery account from mixing a
 * personal order into the same table a real buyer owns.
 *
 * Falling back to the single-role check preserves the pre-migration behaviour
 * for accounts the sweep has not touched yet, so a legacy customer keeps
 * shopping while a legacy rider stays out of the cart.
 */
export function canShopWithRoles(roles: unknown, legacyRole?: string | null): boolean {
  const pool = normalizeRoles(roles);
  if (pool.length === 0) return canShop(legacyRole);
  return pool.includes("customer");
}
