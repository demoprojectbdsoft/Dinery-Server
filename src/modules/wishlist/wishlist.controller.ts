import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { currentUserId } from "../../utils/authz";
import * as wishlistService from "./wishlist.service";

/**
 * A wishlist always belongs to whoever is signed in. The `userId` that clients
 * used to send is ignored, so it can no longer address another account.
 */

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await wishlistService.getWishlistByUserId(currentUserId(req.user));
  apiResponse(res, 200, wishlist, "Wishlist fetched successfully");
});

export const addToWishlist = catchAsync(async (req, res) => {
  const item = await wishlistService.addToWishlist(currentUserId(req.user), req.body.productId);
  apiResponse(res, 201, item, "Added to wishlist");
});

export const removeFromWishlist = catchAsync(async (req, res) => {
  await wishlistService.removeFromWishlist(
    currentUserId(req.user),
    req.params.productId as string
  );
  apiResponse(res, 200, null, "Removed from wishlist");
});

export const isWishlisted = catchAsync(async (req, res) => {
  const productId = (req.query.productId || req.params.productId) as string;
  if (!productId) throw new ApiError(400, "productId is required");

  const result = await wishlistService.isWishlisted(currentUserId(req.user), productId);
  apiResponse(res, 200, result, "Wishlist status fetched successfully");
});
