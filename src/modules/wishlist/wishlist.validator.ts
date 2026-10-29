import { z } from "zod";
import { objectIdSchema } from "../../utils/ids";

const objectId = objectIdSchema("Invalid ID");

// The owner of the wishlist is taken from the auth token, never the body.
export const addToWishlistSchema = z.object({
  productId: objectId,
});

export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;