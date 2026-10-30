import { Schema, model } from "mongoose";

const warrantySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    activationDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },

    // Copy of the product's warranty terms taken when the order was delivered.
    // Kept on the record so the claim screens still explain the coverage after
    // the product is edited or deleted.
    warrantyType: { type: String },
    warrantyPeriodMonths: { type: Number },
    warrantyTerms: { type: String },

    status: {
      type: String,
      enum: ["active", "expired", "claim_submitted", "under_review", "info_requested", "resolved"],
      default: "active",
    },
    // Claim information
    // What went wrong, picked from a fixed list (see warranty.validator.ts).
    claimProblem: { type: String },
    claimReason: { type: String },
    claimDescription: { type: String },
    claimImages: [{ type: String }],
    // Follow-up messages the customer sends after the admin asks for more
    // information. The first claim stays in claimDescription, so nothing is lost.
    claimReplies: [
      {
        message: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    claimAdminNote: { type: String },
    resolutionDetails: { type: String },
  },
  { timestamps: true }
);

export const Warranty = model("Warranty", warrantySchema);
