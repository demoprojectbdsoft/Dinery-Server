import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { isAdminRole, normalizeRole, hasAnyRole } from "../utils/roles";

/**
 * Allows the request only when the caller holds one of `allowedRoles`.
 *
 * The check reads the caller's approved `roles` array, not `activeRole`. A
 * customer who also runs a shop keeps both entries no matter which dashboard
 * they opened, so a vendor endpoint stays reachable while they are looking at
 * their cart, and a rider endpoint stays unreachable when they only applied.
 *
 * Admin authority keeps the legacy bypass: an admin (or the sandboxed demo
 * admin) can reach any route that explicitly names "admin", the way the store
 * team's review screens have always worked.
 */
export function requireRole(...allowedRoles: string[]) {
  const allowed = allowedRoles.map(normalizeRole);

  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    const isAllowed = hasAnyRole(user?.roles, allowed, user?.role);
    const isAdminAsking = allowed.includes("admin") && isAdminRole(user?.role);

    if (!isAllowed && !isAdminAsking) {
      return next(new ApiError(403, "You don't have permission to perform this action"));
    }

    next();
  };
}
