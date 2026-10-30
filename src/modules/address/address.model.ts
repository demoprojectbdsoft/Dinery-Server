import { Schema, model } from "mongoose";

/**
 * One shipping address a customer chose to keep for next time.
 *
 * The address lives next to the order (not inside it) so that it has its own id
 * and can be edited, made default or removed on its own — the same layout the
 * cart and wishlist use: one row per item, owned through `userId`.
 */
const addressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // A short name the customer picks: "Home", "Office", ...
    label: { type: String, default: "Home" },
    // The same five fields an order's shippingAddress holds, so a saved
    // address can be copied straight into the checkout form.
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Address = model("Address", addressSchema);
