import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String },
    email: { type: String },
    emailVerified: { type: Boolean },
    image: { type: String },
    role: { type: String },
    plan: { type: String },
    status: { type: String },
    member: { type: String },   
    points: { type: Number },
    phone: { type: String },
    bio: { type: String },
    department: { type: String },
    /** Rider-only details, filled in from the rider profile page. */
    vehicleType: { type: String },
    vehicleNumber: { type: String },
    licenseNumber: { type: String },
    /** Riders go offline to stop receiving new delivery requests. */
    availability: { type: String, enum: ["online", "offline"], default: "online" },
    /**
     * The marketplace state of this account.
     *
     * It is kept apart from `role` on purpose: an applicant is still a customer
     * until an admin approves, and a rejected applicant goes back to being one
     * without ever gaining vendor authority. "none" means no application.
     */
    vendorStatus: {
      type: String,
      enum: ["none", "pending", "under_review", "approved", "rejected", "cancelled"],
      default: "none",
    },
    /** The application behind `vendorStatus`, so the account can always find it. */
    vendorApplicationId: { type: Schema.Types.ObjectId, ref: "VendorApplication", default: null },
    /** The shop this account owns. One account, at most one store. */
    vendorStoreId: { type: Schema.Types.ObjectId, ref: "VendorStore", default: null },
  },
  { timestamps: true, collection: "user" }
);

export const User = model("User", userSchema);