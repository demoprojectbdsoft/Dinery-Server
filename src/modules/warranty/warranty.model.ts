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

    // Why an "expired" record is closed. Without this, expired hides three
    // different stories: the date passed, the claim was rejected, or the order
    // went back. Only "date" can be undone by extending the coverage.
    closedReason: { type: String, enum: ["date", "rejected", "void"] },

    // Every extension an admin granted, oldest first. Kept as history, so any
    // extra months on a record can always be explained later.
    extensions: [
      {
        months: { type: Number, required: true },
        previousExpiryDate: { type: Date, required: true },
        newExpiryDate: { type: Date, required: true },
        reason: { type: String, required: true },
        extendedBy: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
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
