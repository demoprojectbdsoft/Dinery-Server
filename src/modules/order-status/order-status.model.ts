import { Schema, model } from "mongoose";

const orderStatusSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    status: {
      type: String,
      enum: ["confirmed", "processing", "shipped", "delivered", "cancelled"],
      required: true,
    },
    note: { type: String },
    /** Id of the user who made the change (kept as a string: demo users have no real ObjectId). */
    changedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export const OrderStatusLog = model("OrderStatusLog", orderStatusSchema);