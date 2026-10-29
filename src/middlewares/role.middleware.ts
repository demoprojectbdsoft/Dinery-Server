import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { isAdminRole, normalizeRole } from "../utils/roles";

/** Allows the request only when the caller holds one of `allowedRoles`. */
export function requireRole(...allowedRoles: string[]) {
  const allowed = allowedRoles.map(normalizeRole);

  return (req: Request, res: Response, next: NextFunction) => {
    const isAllowed = allowed.includes(normalizeRole(req.user?.role));
    // The demo admin is an admin everywhere except in the undo log.
    const isAdminAsking = allowed.includes("admin") && isAdminRole(req.user?.role);

    if (!isAllowed && !isAdminAsking) {
      return next(new ApiError(403, "You don't have permission to perform this action"));
    }

    next();
  };
}
