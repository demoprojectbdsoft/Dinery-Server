import { Wishlist } from "./wishlist.model";
import { Product } from "../product/product.model";
import { User } from "../user/user.model";
import { ApiError } from "../../utils/apiError";
import { canShopWithRoles, canSwitchToShopper, roleLabel } from "../../utils/roles";

// Fetches user wishlist and returns items along with totalItems count
export async function getWishlistByUserId(userId: string) {
  const items = await Wishlist.find({ userId }).populate("productId").sort({ createdAt: -1 });
  return {
    items,
    totalItems: items.length,
    itemCount: items.length,
  };
}

export async function addToWishlist(userId: string, productId: string) {
  const user = await User.findById(userId);
  // Same strict rule as the cart: `customer` must be in the approved roles AND
  // the account must be on the customer dashboard. A rider or vendor who also
  // holds `customer` has to switch first.
  if (user && !canShopWithRoles(user.roles, user.role, user.activeRole)) {
    if (canSwitchToShopper(user.roles, user.activeRole || user.role)) {
      throw new ApiError(403, "Switch to the customer dashboard to add products to wishlist");
    }
    throw new ApiError(
      403,
      `${roleLabel(user.activeRole || user.role)} accounts cannot add products to wishlist`
    );
  }

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");

  const existing = await Wishlist.findOne({ userId, productId });
  if (existing) return existing.populate("productId");

  const item = await Wishlist.create({ userId, productId });
  return item.populate("productId");
}

export async function removeFromWishlist(userId: string, productId: string) {
  const item = await Wishlist.findOneAndDelete({ userId, productId });
  if (!item) throw new ApiError(404, "Item not found in wishlist");
  return item;
}

export async function isWishlisted(userId: string, productId: string) {
  const item = await Wishlist.findOne({ userId, productId });
  return { isWishlisted: !!item };
}
