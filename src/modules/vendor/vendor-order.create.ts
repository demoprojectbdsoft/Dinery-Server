import { Types, type ClientSession } from "mongoose";
import { VendorOrder, type VendorOrderStatus } from "./vendor-order.model";

/**
 * Splits a freshly placed checkout into one row per seller.
 *
 * `createOrder` calls this inside its own transaction, so an order and its
 * vendor groups always exist together. Products with no `vendorId` are the
 * platform's own stock: they stay on the parent order only, which is why an
 * order paid entirely for platform products creates nothing here.
 *
 * The file imports the model and nothing else on purpose: `order.service`
 * imports it, and the listing service imports the order, so this is the one
 * direction that keeps the two modules acyclic.
 */

function shortOrderNumber(id: unknown): string {
  return `#ORD-${String(id).slice(-6).toUpperCase()}`;
}

/** Groups the order's lines by seller and writes one row for each. */
export async function createVendorOrdersForOrder(order: any, session?: ClientSession) {
  const groups = new Map<
    string,
    { storeId: string | null; items: any[]; subtotal: number }
  >();

  for (const item of order.items || []) {
    const vendorId = item.vendorId ? String(item.vendorId) : "";
    if (!vendorId) continue;

    const group = groups.get(vendorId) || {
      storeId: item.storeId ? String(item.storeId) : null,
      items: [],
      subtotal: 0,
    };

    group.items.push({
      productId: item.productId,
      title: item.title,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      image: item.image || "",
    });
    group.subtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);

    groups.set(vendorId, group);
  }

  if (groups.size === 0) return [];

  const rows = [...groups.entries()].map(([vendorId, group]) => ({
    orderId: order._id,
    vendorId,
    storeId: group.storeId,
    orderNumber: shortOrderNumber(order._id),
    customerName: order.shippingAddress?.fullName || "",
    customerPhone: order.shippingAddress?.phone || "",
    city: order.shippingAddress?.city || "",
    paymentMethod: order.paymentMethod || "",
    items: group.items,
    subtotal: group.subtotal,
    status: "pending" as const,
    history: [{ status: "pending" as const, at: new Date(), note: "Order placed" }],
  }));

  // `create` with a session keeps the groups inside the checkout's transaction;
  // the unique (order, vendor) index turns a replay into a duplicate-key write
  // rather than a second group.
  return VendorOrder.create(rows, { session: session ?? undefined, ordered: false }).catch(
    (error: any) => {
      if (error?.code === 11000 || error?.writeErrors?.length) return [];
      throw error;
    }
  );
}

// ─── Keeping the groups in step with the parent ───────────────────────────────

/**
 * The parent stages that also decide the seller's stage.
 *
 * `guard` lists the statuses that must not be overwritten: a group the seller
 * already rejected stays rejected even if the rest of the order ships, and a
 * delivered group is never reopened by a later status write.
 */
const PARENT_STATUS_STEPS: Record<
  string,
  { status: VendorOrderStatus; note: string; guard: VendorOrderStatus[] }
> = {
  shipped: {
    status: "shipped",
    note: "Shipped with the rest of the order",
    guard: ["shipped", "delivered", "cancelled", "rejected"],
  },
  delivered: {
    status: "delivered",
    note: "Delivered with the rest of the order",
    guard: ["delivered", "cancelled"],
  },
  cancelled: {
    status: "cancelled",
    note: "The customer's order was cancelled",
    guard: ["cancelled", "delivered", "rejected"],
  },
};

/**
 * Points every group of an order at the job carrying it.
 *
 * The store assigns one rider per order, not per seller, so the groups follow
 * the parent's delivery rather than owning a second assignment. A reassignment
 * overwrites the old job, which is why this is not guarded on an empty field.
 */
export async function syncVendorOrdersForDelivery(
  orderId: Types.ObjectId,
  deliveryId: Types.ObjectId,
  riderId: Types.ObjectId
) {
  await VendorOrder.updateMany({ orderId }, { $set: { deliveryId, riderId } });
}

/**
 * Carries the parent's shipping stage down to the seller rows.
 *
 * Without this a seller's board would keep saying "ready for shipment" after
 * the parcel had already left, so the vendor screens would disagree with the
 * order the customer is tracking.
 */
export async function syncVendorOrdersForParentStatus(
  orderId: string,
  parentStatus: string,
  session?: ClientSession
) {
  const step = PARENT_STATUS_STEPS[parentStatus];
  if (!step) return;

  await VendorOrder.updateMany(
    { orderId, status: { $nin: step.guard } },
    {
      $set: { status: step.status },
      $push: {
        history: {
          status: step.status,
          at: new Date(),
          note: step.note,
          by: null,
        },
      },
    },
    { session: session ?? undefined }
  );
}
