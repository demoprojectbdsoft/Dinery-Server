import { Schema, model } from "mongoose";
import {
  RIDER_APPLICATION_STATUSES,
  RIDER_TIME_SLOTS,
  RIDER_VEHICLE_TYPES,
  RIDER_WEEK_DAYS,
} from "./rider.types";

/**
 * One person's request to deliver on the platform.
 *
 * Mirrors the vendor-application shape: the row is a snapshot of what was
 * submitted, and a resubmission after a rejection updates the same row so the
 * reference stays stable and the review history lives in one place.
 */

const personalInfoSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "" },
    dateOfBirth: { type: Date, default: null },
    nationalId: { type: String, default: "" },
    /** A photo the reviewer may want to see; not always present. */
    photoUrl: { type: String, default: "" },
  },
  { _id: false }
);

const contactInfoSchema = new Schema(
  {
    emergencyContactName: { type: String, default: "" },
    emergencyContactPhone: { type: String, default: "" },
    preferredContact: { type: String, default: "phone" },
  },
  { _id: false }
);

const serviceAddressSchema = new Schema(
  {
    country: { type: String, default: "Bangladesh" },
    division: { type: String, default: "" },
    city: { type: String, default: "" },
    area: { type: String, default: "" },
    address: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false }
);

const vehicleSchema = new Schema(
  {
    type: { type: String, enum: RIDER_VEHICLE_TYPES, default: "motorcycle" },
    number: { type: String, default: "" },
    licenseNumber: { type: String, default: "" },
    licenseExpiry: { type: Date, default: null },
    hasOwnVehicle: { type: Boolean, default: true },
  },
  { _id: false }
);

const documentsSchema = new Schema(
  {
    drivingLicenseUrl: { type: String, default: "" },
    nationalIdUrl: { type: String, default: "" },
    vehicleDocsUrl: { type: String, default: "" },
    /** Anything else the reviewer asked for. */
    otherUrl: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const availabilitySchema = new Schema(
  {
    days: {
      type: [
        {
          type: String,
          enum: RIDER_WEEK_DAYS as unknown as string[],
        },
      ],
      default: [],
    },
    slots: {
      type: [
        {
          type: String,
          enum: RIDER_TIME_SLOTS as unknown as string[],
        },
      ],
      default: [],
    },
    /** How far a rider is willing to ride for one drop-off, in km. */
    maxDistanceKm: { type: Number, default: 15 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const experienceSchema = new Schema(
  {
    years: { type: Number, default: 0 },
    previousPlatforms: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

/** One line of the review trail. */
const applicationEventSchema = new Schema(
  {
    status: { type: String, enum: RIDER_APPLICATION_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const riderApplicationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /** "RID-XXXXXX" — the reference the applicant quotes to support. */
    reference: { type: String, required: true, unique: true },

    status: {
      type: String,
      enum: RIDER_APPLICATION_STATUSES,
      default: "pending",
      index: true,
    },

    personalInfo: { type: personalInfoSchema, required: true },
    contactInfo: { type: contactInfoSchema, default: () => ({}) },
    serviceAddress: { type: serviceAddressSchema, required: true },
    vehicle: { type: vehicleSchema, required: true },
    documents: { type: documentsSchema, default: () => ({}) },
    availability: { type: availabilitySchema, default: () => ({}) },
    experience: { type: experienceSchema, default: () => ({}) },

    /** Filled by the reviewer. */
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    reviewNotes: { type: String, default: "" },

    submittedAt: { type: Date, default: Date.now },
    /** How many times the applicant submitted after a rejection. */
    resubmissionCount: { type: Number, default: 0 },

    history: { type: [applicationEventSchema], default: [] },
  },
  { timestamps: true }
);

/**
 * One account may hold one open application at a time. The partial index only
 * covers rows that are still in play, so a rejected applicant can apply again
 * while a duplicate open application is impossible.
 */
riderApplicationSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "under_review", "approved"] } },
    name: "one_open_rider_application_per_user",
  }
);

// The admin list sorts by newest first and filters by status.
riderApplicationSchema.index({ status: 1, submittedAt: -1 });

export const RiderApplication = model("RiderApplication", riderApplicationSchema);
