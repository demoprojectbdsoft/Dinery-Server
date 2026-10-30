import { z } from "zod";

// Text fields are trimmed so a stray space never reaches the storefront, and
// capped so one banner cannot push the layout out of shape.
const shortText = z.string().trim().max(160).optional();
const urlText = z.string().trim().max(500).optional();

export const createPromoSchema = z.object({
  name: z.string().trim().min(1, "Give this banner a name so you can find it later"),
  placement: z.enum(["tile", "strip"]).optional(),
  isActive: z.boolean().optional(),
  subtitle: shortText,
  highlightText: shortText,
  title: shortText,
  image: urlText,
  imageAlt: shortText,
  href: urlText,
  buttonText: shortText,
  badgeLabel: shortText,
  badgeValue: shortText,
  order: z.number().int().optional(),
});

// Every field is optional on update, so the dashboard can flip one switch
// without resending the whole banner.
export const updatePromoSchema = createPromoSchema.partial();

export type CreatePromoInput = z.infer<typeof createPromoSchema>;
export type UpdatePromoInput = z.infer<typeof updatePromoSchema>;
