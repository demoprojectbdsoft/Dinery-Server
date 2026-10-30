import { Schema, model } from "mongoose";
import { MAX_WARRANTY_EXTENSIONS } from "./warranty.types";

// One extension, kept as history so any extra months can be explained later.
const extensionSchema = new Schema({
  months: { type: Number, required: true },
  previousExpiryDate: { type: Date, required: true },
  newExpiryDate: { type: Date, required: true },
  reason: { type: String, required: true },
  extendedBy: { type: String },
  createdAt: { type: Date, default: Date.now },
});

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
      enum: ["active", "expired", "claim_submitted", "under_review", "resolved"],
      default: "active",
    },

    // Why an "expired" record is closed. Without this, expired hides three
    // different stories: the date passed, the claim was rejected, or the order
    // went back. Only "date" can be undone by extending the coverage.
    closedReason: { type: String, enum: ["date", "rejected", "void"] },

    // Every extension an admin granted, oldest first. Kept as history, so any
    // extra months on a record can always be explained later.
    // The length is capped here as a last resort: the service checks first and
    // explains why, this only stops a record being saved past the limit.
    extensions: {
      type: [extensionSchema],
      default: [],
      validate: {
        validator: (list: unknown[]) => list.length <= MAX_WARRANTY_EXTENSIONS,
        message: `A warranty can be extended at most ${MAX_WARRANTY_EXTENSIONS} times`,
      },
    },
    // Claim information
    // What went wrong, picked from a fixed list (see warranty.validator.ts).
    claimProblem: { type: String },
    claimReason: { type: String },
    claimDescription: { type: String },
    claimImages: [{ type: String }],
    claimAdminNote: { type: String },
    resolutionDetails: { type: String },
  },
  { timestamps: true }
);

export const Warranty = model("Warranty", warrantySchema);
