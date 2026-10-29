import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { currentUserId } from "../../utils/authz";
import * as cartService from "./cart.service";

/**
 * A cart always belongs to whoever is signed in. The `userId` that clients used
 * to send is ignored, so it can no longer address another account.
 */

export const getCart = catchAsync(async (req, res) => {
  const cart = await cartService.getCartByUserId(currentUserId(req.user));
  apiResponse(res, 200, cart, "Cart fetched successfully");
});

export const addToCart = catchAsync(async (req, res) => {
  const { productId, quantity } = req.body;
  const item = await cartService.addToCart(currentUserId(req.user), productId, quantity);
  apiResponse(res, 201, item, "Added to cart");
});

export const updateCartItem = catchAsync(async (req, res) => {
  const { quantity } = req.body;
  const item = await cartService.updateCartItem(
    currentUserId(req.user),
    req.params.productId as string,
    quantity
  );
  apiResponse(res, 200, item, "Cart updated");
});

export const removeFromCart = catchAsync(async (req, res) => {
  await cartService.removeFromCart(currentUserId(req.user), req.params.productId as string);
  apiResponse(res, 200, null, "Removed from cart");
});

export const clearCart = catchAsync(async (req, res) => {
  await cartService.clearCart(currentUserId(req.user));
  apiResponse(res, 200, null, "Cart cleared");
});

export const isCarted = catchAsync(async (req, res) => {
  const productId = (req.query.productId || req.params.productId) as string;
  if (!productId) throw new ApiError(400, "productId is required");

  const result = await cartService.isCarted(currentUserId(req.user), productId);
  apiResponse(res, 200, result, "Cart status fetched successfully");
});
