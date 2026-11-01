import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { parseQuery } from "../../utils/validate";
import { isAdminRole, normalizeRoles } from "../../utils/roles";
import { assertOwnerOrAdmin, currentUserId } from "../../utils/authz";
import * as userService from "./user.service";
import { exportAccountData } from "./account-export.service";
import {
  ADMIN_ONLY_USER_FIELDS,
  getUsersQuerySchema,
  revokeRoleSchema,
  setActiveRoleSchema,
  selfUpdateUserSchema,
} from "./user.validator";

const ADMIN_ONLY = new Set<string>(ADMIN_ONLY_USER_FIELDS);

export const getUsers = catchAsync(async (req, res) => {
  const query = parseQuery(getUsersQuerySchema, req.query);
  const result = await userService.getUsers(query);
  apiResponse(res, 200, result, "Users fetched successfully");
});

export const getUserById = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id as string);
  assertOwnerOrAdmin(user._id, req.user, "You are not allowed to view this profile");
  apiResponse(res, 200, user);
});

/**
 * Admins manage every account. A customer may only edit their own profile, and
 * only the presentation fields — `role`, `roles`, `activeRole`, `status`,
 * `points`, ... are admin-only so that nobody can promote or un-suspend
 * themselves. A multi-role customer is still refused: the array is the
 * authority, so it belongs to the review flow, never to a PATCH.
 */
export const updateUser = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const isAdmin = isAdminRole(req.user?.role);

  if (!isAdmin && req.user?.id !== id) {
    throw new ApiError(403, "You can only update your own profile");
  }

  if (!isAdmin) {
    const attempted = Object.keys(req.body).filter((key) => ADMIN_ONLY.has(key));
    if (attempted.length > 0) {
      throw new ApiError(403, `Only an admin can change: ${attempted.join(", ")}`);
    }
  }

  // The body already passed updateUserSchema, so picking the self-service
  // subset cannot fail.
  const data = isAdmin ? req.body : selfUpdateUserSchema.parse(req.body);

  const user = await userService.updateUser(id, data);
  apiResponse(res, 200, user, "User updated");
});

export const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.params.id as string);
  apiResponse(res, 200, null, "User deleted");
});

/**
 * The caller's own data, packaged for download. Used by the customer settings
 * page before somebody decides to delete their account.
 */
export const exportMyData = catchAsync(async (req, res) => {
  const data = await exportAccountData(currentUserId(req.user));
  apiResponse(res, 200, data, "Account data exported");
});

/**
 * The approved-role list plus the dashboard the caller is looking at.
 *
 * The frontend reads this on every dashboard visit so the switcher reflects a
 * fresh server decision instead of a session claim. It never accepts a body.
 */
export const getMyRoles = catchAsync(async (req, res) => {
  const roles = await userService.getMyRoles(currentUserId(req.user));
  apiResponse(res, 200, roles, "Roles fetched successfully");
});

/**
 * Points the caller's own dashboard at another approved role.
 *
 * The requested role must already live inside `roles` — the service rejects
 * anything else — so this endpoint cannot promote a pending or rejected
 * applicant. The session token itself is not touched: only the account's
 * active dashboard changes.
 */
export const setActiveRole = catchAsync(async (req, res) => {
  const input = setActiveRoleSchema.parse(req.body || {});
  const result = await userService.setActiveRole(currentUserId(req.user), input);
  apiResponse(res, 200, result, "Dashboard switched");
});

/**
 * Admin only. Removes one approved role and drops the account back to
 * customer when that was the role they were using.
 */
export const revokeRole = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const input = revokeRoleSchema.parse(req.body || {});
  const result = await userService.revokeRole(id, input, req.user?.id);
  apiResponse(res, 200, result, "Role revoked");
});

/**
 * Admin only. Writes the full approved list onto an account in one call, used
 * by the user-edit screen when a store team member needs to fix a legacy row
 * or grant a role without an application. Never exposed to the account owner.
 */
export const setRoles = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const pool = normalizeRoles((req.body || {}).roles);
  if (pool.length === 0) throw new ApiError(400, "At least one role is required");

  const updated = await userService.updateUser(id, { roles: pool } as never);
  apiResponse(res, 200, updated, "Roles updated");
});
