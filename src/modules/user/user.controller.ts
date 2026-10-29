import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as userService from "./user.service";
import { getUsersQuerySchema } from "./user.validator";

export const getUsers = catchAsync(async (req, res) => {
  const query = parseQuery(getUsersQuerySchema, req.query);
  const result = await userService.getUsers(query);
  apiResponse(res, 200, result, "Users fetched successfully");
});

export const getUserById = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id as string);
  apiResponse(res, 200, user);
});

export const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUser(req.params.id as string, req.body);
  apiResponse(res, 200, user, "User updated");
});

export const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.params.id as string);
  apiResponse(res, 200, null, "User deleted");
});