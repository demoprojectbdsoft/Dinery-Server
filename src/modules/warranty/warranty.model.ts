import { Schema, model } from "mongoose";

const warrantySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    activationDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "expired", "claim_submitted", "under_review", "info_requested", "resolved"],
      default: "active",
    },
    // Claim information
    claimReason: { type: String },
    claimDescription: { type: String },
    claimImages: [{ type: String }],
    claimAdminNote: { type: String },
    resolutionDetails: { type: String },
  },
  { timestamps: true }
);

export const Warranty = model("Warranty", warrantySchema);
