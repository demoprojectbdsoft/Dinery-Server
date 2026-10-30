import { User } from "./user.model";
import { ApiError } from "../../utils/apiError";
import { UpdateUserInput, GetUsersQuery } from "./user.validator";
import { getMembershipTier } from "../order/order.service";
import { recordActivity } from "../activity/activity.service";

export async function getUsers(query: GetUsersQuery) {
  const { role, status, search, page, limit } = query;

  const filter: Record<string, any> = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  // Optional search across name and email fields (case-insensitive)
  if (search?.trim()) {
    const q = search.trim();
    const searchRegex = new RegExp(q, "i");
    const searchOr: Record<string, any>[] = [{ name: searchRegex }, { email: searchRegex }];
    // A notification links to the exact account by its id. Without this the
    // email fallback is a substring match, so one admin address can pull up
    // every address that merely contains it.
    if (/^[0-9a-fA-F]{24}$/.test(q)) searchOr.push({ _id: q });
    filter.$or = searchOr;
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getUserById(id: string) {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

export async function updateUser(id: string, data: UpdateUserInput) {
  if (data.points !== undefined && data.member === undefined) {
    data.member = getMembershipTier(data.points);
  }
  const user = await User.findByIdAndUpdate(id, data, { new: true });
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

export async function deleteUser(id: string) {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new ApiError(404, "User not found");

  // Written from the copy that was just removed, so the feed can still name
  // who it was now that the account is gone.
  await recordActivity({
    type: "user_deleted",
    title: `${user.name || "A user"} was deleted`,
    detail: user.email || "",
  });
}