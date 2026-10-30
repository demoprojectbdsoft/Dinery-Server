import { DeliveryStatus } from "./delivery.model";

/**
 * The delivery lifecycle.
 *
 *   assigned ──▶ accepted ──▶ picked_up ──▶ out_for_delivery ──▶ delivered
 *       │            │            │               │
 *       ├─▶ declined │            │               │
 *       └────────────┴────────────┴───────────────┴──▶ cancelled
 *
 * `assigned` is the store offering the job and the rider taking it. From
 * `accepted` on, only the rider moves it forward. `delivered`, `cancelled` and
 * `declined` have no way out: a finished job is history, and a new offer is a
 * new row.
 */
const TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  assigned: ["accepted", "declined", "cancelled"],
  accepted: ["picked_up", "cancelled"],
  picked_up: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
  declined: [],
};

/** The stages a rider may move this delivery to. Empty means "closed". */
export function nextDeliveryStatuses(current: string): DeliveryStatus[] {
  return TRANSITIONS[current as DeliveryStatus] ?? [];
}

/** True when `to` is a legal next stage of `from`. */
export function isAllowedDeliveryTransition(from: string, to: string): boolean {
  return nextDeliveryStatuses(from).includes(to as DeliveryStatus);
}

/**
 * The stage a rider's own button advances to. `delivered` is deliberately not
 * here: a hand-over is confirmed with the customer's delivery code instead, so
 * the rider cannot close a job at the door without meeting them.
 */
export const RIDER_STEP_STATUSES: DeliveryStatus[] = [
  "picked_up",
  "out_for_delivery",
  "cancelled",
];

/** The single button a rider sees next, or null when there is nothing to do. */
export function nextRiderStep(current: string): DeliveryStatus | null {
  if (current === "accepted") return "picked_up";
  if (current === "picked_up") return "out_for_delivery";
  return null;
}
