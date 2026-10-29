import { Schema, model } from "mongoose";

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    image: { type: String },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: false },
    phone: { type: String, required: false },
    address: { type: String, required: false },
    city: { type: String, required: false },
    postalCode: { type: String, required: false },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    shippingAddress: { type: shippingAddressSchema, required: false },
    paymentMethod: { type: String, enum: ["cod", "bkash", "rocket", "nagad"], required: true },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    /**
     * The shipping option chosen for this order, derived from the live site
     * settings at checkout time:
     *   "free"    — free shipping (subtotal >= freeShippingThreshold)
     *   "standard" — standard delivery (SHIPPING_FEE)
     *   "express"  — express delivery (EXPRESS_DELIVERY_FEE)
     */
    shippingMethod: {
      type: String,
      enum: ["free", "standard", "express"],
      default: "standard",
    },
    /** Estimated delivery window copied from site settings at checkout. */
    estimatedDelivery: { type: String, default: "" },
    orderStatus: {
      type: String,
      enum: ["confirmed", "processing", "shipped", "delivered", "cancelled"],
      default: "confirmed",
    },
    customerResponse: {
      type: String,
      enum: ["received", "not_received", "cancelled"],
      default: null,
    },
    customerResponseNote: {
      type: String,
      default: "",
    },
    customerResponseAt: {
      type: Date,
      default: null,
    },
    pointsEarned: { type: Number, default: 0 },
    /** Loyalty points this order used up, and the money they saved. */
    pointsRedeemed: { type: Number, default: 0 },
    pointsDiscount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Order = model("Order", orderSchema);