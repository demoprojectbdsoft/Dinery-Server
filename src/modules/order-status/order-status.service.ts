import { ClientSession } from "mongoose";
import { OrderStatusLog } from "./order-status.model";

export type OrderStatusValue = "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

/** Appends one row to the order timeline, optionally inside a caller's session. */
export async function logOrderStatus(
  orderId: string,
  status: OrderStatusValue,
  options: { note?: string; session?: ClientSession } = {}
) {
  const log = new OrderStatusLog({ orderId, status, note: options.note });
  await log.save({ session: options.session });
  return log;
}

export async function getOrderStatusHistory(orderId: string) {
  return OrderStatusLog.find({ orderId }).sort({ createdAt: 1 });
}