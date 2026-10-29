import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  image: z.string().optional(),
  role: z.enum(["admin", "customer"]).optional(),
  plan: z.string().optional(),
  status: z.enum(["active", "suspended"]).optional(),
  member: z.enum(["silver", "gold", "platinum", "diamond"]).optional(),
  points: z.number().int().nonnegative().optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  department: z.string().optional(),
});

/**
 * Fields that decide what an account can do. Only an admin may write these —
 * otherwise any signed-in user could promote themselves.
 */
export const ADMIN_ONLY_USER_FIELDS = [
  "role",
  "plan",
  "status",
  "member",
  "points",
  "department",
] as const;

/** The only fields a customer may change on their own profile. */
export const selfUpdateUserSchema = updateUserSchema.pick({
  name: true,
  image: true,
  phone: true,
  bio: true,
});

export const getUsersQuerySchema = z.object({
  role: z.string().optional(),
  status: z.string().optional(),
  member: z.enum(["silver", "gold", "platinum", "diamond"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(20),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SelfUpdateUserInput = z.infer<typeof selfUpdateUserSchema>;
export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;