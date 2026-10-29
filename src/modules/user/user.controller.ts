import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { parseQuery } from "../../utils/validate";
import { isAdminRole } from "../../utils/roles";
import { assertOwnerOrAdmin, currentUserId } from "../../utils/authz";
import * as userService from "./user.service";
import { exportAccountData } from "./account-export.service";
import {
  ADMIN_ONLY_USER_FIELDS,
  getUsersQuerySchema,
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
 * only the presentation fields — `role`, `status`, `points`, ... are admin-only
 * so that nobody can promote or un-suspend themselves.
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
