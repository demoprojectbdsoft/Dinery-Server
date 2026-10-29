import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ID");

export const addToWishlistSchema = z.object({
  userId: objectId,
  productId: objectId,
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;