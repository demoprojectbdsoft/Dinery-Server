/**
 * The order status flow.
 *
 *   confirmed ──▶ processing ──▶ shipped ──▶ delivered
 *       │             │            │             │
 *       └─────────────┴────────────┴─────────────┴──▶ cancelled
 *
 * Rules:
 * - An order only moves forward, one step at a time.
 * - "cancelled" can be reached from any stage, and has no way out: a refunded
 *   order can never be revived.
 * - "delivered → cancelled" is a return, and the service reverses everything
 *   the delivery had credited.
 */
export const ORDER_STATUSES = [
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: ["cancelled"],
  cancelled: [],
};

/** The stages an admin may move this order to. Empty means "closed". */
export function nextStatuses(current: string): OrderStatus[] {
  return NEXT_STATUSES[current as OrderStatus] ?? [];
}

/** True when `to` is a legal next stage of `from`. */
export function isAllowedTransition(from: string, to: string): boolean {
  return nextStatuses(from).includes(to as OrderStatus);
}

/** True for statuses that nothing can move out of. */
export function isClosedStatus(status: string): boolean {
  return nextStatuses(status).length === 0;
}
