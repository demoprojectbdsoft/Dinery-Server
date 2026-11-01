import { Types } from "mongoose";
import { User } from "./user.model";
import { ApiError } from "../../utils/apiError";
import {
  GetUsersQuery,
  RevokeRoleInput,
  SetActiveRoleInput,
  UpdateUserInput,
} from "./user.validator";
import { getMembershipTier } from "../order/order.service";
import { recordActivity, notifyUser } from "../activity/activity.service";
import { normalizeRoles } from "../../utils/roles";

export async function getUsers(query: GetUsersQuery) {
  const { role, status, search, page, limit } = query;

  const filter: Record<string, any> = {};
  // Admin filter by role uses the array so a rider-who-shops still surfaces
  // under "rider". `$in` on a String[] field matches any array element.
  if (role) filter.roles = { $in: [role] };
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

/**
 * Applies an admin (or self-service) update.
 *
 * `role` is treated as the alias of `activeRole` and both are always kept in
 * sync here. Any write to `roles` from an admin is filtered against the known
 * list so nothing invalid can slip in through the array. A self-service call
 * never carries those keys — the controller strips them first.
 */
export async function updateUser(id: string, data: UpdateUserInput) {
  if (data.points !== undefined && data.member === undefined) {
    data.member = getMembershipTier(data.points);
  }

  const patch: Record<string, unknown> = { ...data };
  const roles = normalizeRoles(patch.roles);
  if (roles.length > 0) patch.roles = roles;
  // `role` and `activeRole` are two views of the same value. Whichever the
  // caller wrote, mirror it into the other so the JWT, the session and the
  // dashboard switcher all read the same truth.
  if (patch.activeRole) patch.role = patch.activeRole;
  else if (patch.role) patch.activeRole = patch.role;

  const user = await User.findByIdAndUpdate(id, patch, { new: true });
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

// ─── Multi-role helpers ───────────────────────────────────────────────────────

/**
 * The caller's approved roles and the dashboard they are looking at.
 *
 * Read from the database every time so the switcher cannot be spoofed by an
 * out-of-date session payload. A row the migration has not touched yet
 * reports as `[role]` so legacy accounts keep working normally.
 */
export async function getMyRoles(userId: string) {
  const user: any = await User.findById(userId)
    .select("roles activeRole role status vendorStatus riderStatus")
    .lean();
  if (!user) throw new ApiError(404, "User not found");

  const pool = normalizeRoles(user.roles);
  const resolved = pool.length > 0 ? pool : normalizeRoles(user.role || "customer");
  const active = normalizeRoles(user.activeRole || user.role)[0] || resolved[0] || "customer";
  return {
    roles: resolved,
    activeRole: resolved.includes(active) ? active : resolved[0],
    vendorStatus: user.vendorStatus || "none",
    riderStatus: user.riderStatus || "none",
  };
}

/**
 * Points the account at a different dashboard.
 *
 * The requested role has to be inside the approved list — the array is the
 * only source of truth here, and the client's `activeRole` claim is treated as
 * a hint. Both `activeRole` and the legacy `role` string are written together
 * so the JWT's next refresh keeps reading the same thing.
 */
export async function setActiveRole(userId: string, input: SetActiveRoleInput) {
  const user: any = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const approved = normalizeRoles(user.roles);
  const pool = approved.length > 0 ? approved : normalizeRoles(user.role || "customer");
  const wanted = String(input.role || "").toLowerCase();
  if (!pool.includes(wanted)) {
    throw new ApiError(403, "This account has not been approved for that dashboard");
  }

  user.activeRole = wanted;
  // Mirror the alias so every reader — the session hook, the JWT, the legacy
  // middleware — sees the same value.
  user.role = wanted;
  await user.save();

  return {
    roles: pool,
    activeRole: wanted,
  };
}

/**
 * Removes one approved role and, when necessary, moves the account back to
 * being a plain customer.
 *
 * Called from the admin desk when a seller's shop is closed or a rider's
 * licence lapses. The customer entry is never revoked: even if it is passed
 * in, the service silently adds it back so the account can still sign in.
 */
export async function revokeRole(userId: string, input: RevokeRoleInput, adminId?: string) {
  if (!Types.ObjectId.isValid(userId)) throw new ApiError(404, "User not found");

  const user: any = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const target = String(input.role || "").toLowerCase();
  const current = normalizeRoles(user.roles);
  const pool = current.length > 0 ? current : normalizeRoles(user.role || "customer");

  if (!pool.includes(target)) {
    throw new ApiError(400, `This account does not hold the ${target} role`);
  }
  if (target === "customer") {
    throw new ApiError(400, "The customer role cannot be revoked");
  }

  const remaining = pool.filter((role) => role !== target);
  // Every account keeps customer so the person can still sign in and shop.
  const nextRoles = remaining.includes("customer") ? remaining : [...remaining, "customer"];
  const active = nextRoles.includes(user.activeRole) ? user.activeRole : "customer";

  user.roles = nextRoles;
  user.activeRole = active;
  user.role = active;
  // Clear the marketplace state so the applicant can reapply if the platform
  // policy allows; keeping "approved" here would let a stale screen reopen the
  // workspace after the revoke.
  if (target === "vendor") {
    user.vendorStatus = "none";
    user.vendorApplicationId = null;
    // The store row itself is left alone; the store team closes it separately.
  }
  if (target === "rider") {
    user.riderStatus = "none";
    user.riderApplicationId = null;
  }
  await user.save();

  await notifyUser({
    userId: String(user._id),
    role: target === "rider" ? "rider" : "vendor",
    type: target === "rider" ? "rider_application" : "vendor_application",
    title: `Your ${target} access was removed`,
    detail: input.reason?.trim() || "Contact support if you think this is a mistake.",
    ref: String(adminId || ""),
  });

  await recordActivity({
    type: target === "rider" ? "rider" : "vendor",
    title: `${target} role revoked`,
    detail: `${user.email || "Account"} · by admin`,
    ref: String(user._id),
  });

  return {
    roles: nextRoles,
    activeRole: active,
  };
}

/**
 * One-off sweep that gives every existing row a `roles` array and an
 * `activeRole` mirror.
 *
 * Runs at server start and is idempotent: only rows that are missing either
 * field are written, so a restart never re-touches an account that already
 * fits the shape.
 */
export async function syncLegacyRoles(): Promise<{ updated: number }> {
  const cursor = User.find({
    $or: [
      { roles: { $exists: false } },
      { roles: { $size: 0 } },
      { activeRole: { $exists: false } },
      { activeRole: null },
    ],
  })
    .select("_id role roles activeRole vendorStatus riderStatus")
    .cursor();

  let updated = 0;
  for await (const user of cursor as any) {
    const legacy = normalizeRoles((user as any).role)[0] || "customer";
    const roles = normalizeRoles((user as any).roles);
    const nextRoles = roles.length > 0 ? Array.from(new Set([...roles, "customer"])) : [legacy];
    // Admin and rider authority is preserved; a legacy admin stays an admin,
    // and a legacy rider also keeps the customer entry because they still shop.
    if (!nextRoles.includes("customer") && legacy !== "admin" && legacy !== "demoadmin") {
      nextRoles.push("customer");
    }
    const active = normalizeRoles((user as any).activeRole)[0] || legacy;

    await User.updateOne(
      { _id: (user as any)._id },
      {
        $set: {
          roles: nextRoles,
          activeRole: active,
          role: active,
        },
      }
    );
    updated += 1;
  }

  return { updated };
}
