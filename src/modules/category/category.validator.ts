import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ObjectId");

export const createCategorySchema = z.object({
  ownerId: objectId,
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, hyphen-separated"),
  image: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;