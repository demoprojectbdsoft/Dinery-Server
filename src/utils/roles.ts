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
