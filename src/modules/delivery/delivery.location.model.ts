import { Schema, model } from "mongoose";

/** One breadcrumb on the rider's path for this delivery. */
const trailPointSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * The rider's latest known position for one delivery.
 *
 * One document per delivery, not per ping: the map only ever needs the newest
 * point, and keeping the last few beside it gives the customer a short trail
 * without a time-series collection. The trail is capped, so a long shift cannot
 * grow a document past the 16 MB limit.
 */
const riderLocationSchema = new Schema(
  {
    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      unique: true,
      index: true,
    },
    riderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    /** Metres of uncertainty, straight from the browser's geolocation API. */
    accuracy: { type: Number, default: null },
    heading: { type: Number, default: null },
    speed: { type: Number, default: null },
    trail: { type: [trailPointSchema], default: [] },
  },
  { timestamps: true }
);

/** The newest 30 points are enough to draw a path on a phone screen. */
export const TRAIL_LIMIT = 30;

export const RiderLocation = model("RiderLocation", riderLocationSchema);
