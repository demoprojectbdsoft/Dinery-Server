import { z } from "zod";

/**
 * The departments the contact page offers. The value only changes the label in
 * the email, because both end up in the same store inbox.
 */
export const CONTACT_DEPARTMENTS = ["support", "contact"] as const;

/**
 * A message a visitor writes on the contact page. Nothing is stored in the
 * database: the message is emailed to the store and the visitor gets no record,
 * so every field is validated and trimmed before it leaves the API.
 */
export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100, "Name is too long"),
  email: z.email("Enter a valid email address").max(200, "Email is too long"),
  department: z.enum(CONTACT_DEPARTMENTS).optional().default("support"),
  subject: z.string().trim().max(150, "Subject is too long").optional().default(""),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters")
    .max(3000, "Message is too long"),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
