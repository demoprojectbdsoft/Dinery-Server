import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid category ID");

export const createSubCategorySchema = z.object({
  ownerId: objectId,
  categoryId: objectId,
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, hyphen-separated"),
  image: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateSubCategorySchema = createSubCategorySchema.partial();

export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubCategorySchema>;