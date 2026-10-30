import { z } from "zod";

/**
 * One transactional email the storefront asks for.
 *
 * Only the password reset lives here today, and the link is built by
 * better-auth, so the caller sends the finished URL instead of a token.
 */
export const resetPasswordMailSchema = z.object({
  email: z.email("Enter a valid email address").max(200, "Email is too long"),
  name: z.string().trim().max(120, "Name is too long").optional(),
  url: z.url("The reset link must be a full URL").max(2000, "The reset link is too long"),
});

export type ResetPasswordMailInput = z.infer<typeof resetPasswordMailSchema>;
