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
  },
  { timestamps: true, collection: "user" }
);

export const User = model("User", userSchema);