import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ObjectId");

export const createSlideSchema = z.object({
  ownerId: objectId,
  productId: objectId,
  tabTitle: z.string().min(1, "Tab title is required"),
  subtitle: z.string().min(1, "Subtitle is required"),
  tagline: z.string().min(1, "Tagline is required"),
  targetDate: z.coerce.date().optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateSlideSchema = createSlideSchema.partial();

export type CreateSlideInput = z.infer<typeof createSlideSchema>;
export type UpdateSlideInput = z.infer<typeof updateSlideSchema>;