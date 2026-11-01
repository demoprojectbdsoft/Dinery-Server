/**
 * Shared enums for the rider application pipeline.
 *
 * The statuses match the vendor flow one-for-one so the review desk reads the
 * same way, and so a rejected applicant's reapplication reuses the same row
 * with the same history trail.
 */

export const RIDER_APPLICATION_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type RiderApplicationStatus = (typeof RIDER_APPLICATION_STATUSES)[number];

/** The account-level mirror of the application, carried on the user row. */
export const RIDER_ACCOUNT_STATES = [
  "none",
  "pending",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type RiderAccountState = (typeof RIDER_ACCOUNT_STATES)[number];

/** The vehicle options the platform recognises. Kept short on purpose. */
export const RIDER_VEHICLE_TYPES = [
  "bicycle",
  "motorcycle",
  "scooter",
  "car",
  "walk",
] as const;
export type RiderVehicleType = (typeof RIDER_VEHICLE_TYPES)[number];

/** Days the rider can work, so the assignment engine never offers a Sunday. */
export const RIDER_WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type RiderWeekDay = (typeof RIDER_WEEK_DAYS)[number];

export const RIDER_TIME_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type RiderTimeSlot = (typeof RIDER_TIME_SLOTS)[number];

/** A pending or in-review applicant holds no rider authority. */
export const BLOCKING_RIDER_STATUSES: RiderApplicationStatus[] = ["pending", "under_review"];

export const isBlockingRiderStatus = (status?: string | null): boolean =>
  BLOCKING_RIDER_STATUSES.includes((status || "") as RiderApplicationStatus);
