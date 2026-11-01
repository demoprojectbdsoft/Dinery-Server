import { ApiError } from "./apiError";
import { refIdString } from "./ids";
import { canShopWithRoles, isAdminRole, normalizeRoles, roleLabel } from "./roles";

/**
 * Authorization helpers for the endpoints that act on "my own" data.
 *
 * Identity always comes from the bearer token. A client-supplied id may narrow
 * a query, but it can never point at somebody else's records unless the caller
 * is an admin.
 */

type Requester =
  | {
      id?: string;
      role?: string;
      roles?: string[];
    }
  | undefined;

/** The caller's own id — for strictly personal resources (cart, wishlist). */
export function currentUserId(user: Requester): string {
  if (!user?.id) throw new ApiError(401, "Authentication required");
  return user.id;
}

/**
 * Refuses cart, wishlist and checkout writes for accounts that do not shop.
 * The storefront hides those buttons, but a request can always be replayed, so
 * the rule is enforced here as well.
 *
 * The check reads the approved roles array, not the active one, so a rider who
 * was also a customer can keep their cart no matter which dashboard opened it.
 *
 * `action` is the verb phrase, for example "add products to cart".
 */
export function assertShopper(user: Requester, action: string): void {
  const pool = normalizeRoles(user?.roles);
  // Legacy rows only carry `role`; treat that string as the whole list so a
  // non-shopper is still refused the way the single-role check refused them.
  if (pool.length === 0 && (!user?.role || canShop(user?.role))) return;
  if (canShopWithRoles(user?.roles, user?.role)) return;
  throw new ApiError(403, `${roleLabel(user?.role)} cannot ${action}`);
}

/**
 * The user id a query may be filtered by. Admins keep whatever they asked for
 * (undefined means "no filter" — the full list); everyone else is pinned to
 * their own id.
 */
export function scopedUserId(user: Requester, requested?: string): string | undefined {
  if (!user?.id) throw new ApiError(401, "Authentication required");
  return isAdminRole(user.role) ? requested : user.id;
}

/**
 * Throws 403 unless the caller is an admin or the resource belongs to them.
 * `owner` may be a raw id, an ObjectId or a populated document.
 */
export function assertOwnerOrAdmin(
  owner: unknown,
  user: Requester,
  message = "You are not allowed to access this resource"
): void {
  if (isAdminRole(user?.role)) return;
  if (user?.id && refIdString(owner) === user.id) return;
  throw new ApiError(403, message);
}

/** Re-uses the shopping rule against the raw canShop helper for legacy reads. */
function canShop(role?: string | null): boolean {
  return canShopWithRoles(undefined, role);
}
