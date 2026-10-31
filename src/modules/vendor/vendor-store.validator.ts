import { z } from "zod";

/**
 * What a vendor may change about their own storefront.
 *
 * The store's slug, status, counters and promotion flags are deliberately
 * absent: they are either permanent (links are built from the slug) or owned
 * by the store team (status, featured placement).
 */

const addressSchema = z.object({
  country: z.string().trim().max(80).optional().default("Bangladesh"),
  division: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  area: z.string().trim().max(120).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  postalCode: z.string().trim().max(20).optional().default(""),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

const socialLinksSchema = z.object({
  facebook: z.string().trim().max(300).optional().default(""),
  instagram: z.string().trim().max(300).optional().default(""),
  x: z.string().trim().max(300).optional().default(""),
  linkedin: z.string().trim().max(300).optional().default(""),
});

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(2, "Store name is too short").max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    logo: z.string().trim().max(500).optional(),
    coverImage: z.string().trim().max(500).optional(),
    email: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(30).optional(),
    category: z.string().trim().max(80).optional(),
    website: z.string().trim().max(300).optional(),
    address: addressSchema.optional(),
    socialLinks: socialLinksSchema.optional(),
    isVisible: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
