import { Order } from "./order.model";
import { Product } from "../product/product.model";
import { Cart } from "../cart/cart.model";
import { User } from "../user/user.model";
import { Transaction } from "../transaction/transaction.model";
import { ApiError } from "../../utils/apiError";
import { assertOwnerOrAdmin } from "../../utils/authz";
import { CreateOrderInput, UpdateOrderStatusInput, CustomerResponseInput, GetOrdersQuery } from "./order.validator";
import { logOrderStatus } from "../order-status/order-status.service";
import { createTransaction, getLatestTransactionForOrder } from "../transaction/transaction.service";
import { getSiteSettings } from "../site-settings/site-settings.service";
import { createWarrantiesForOrder, voidWarrantiesForOrder } from "../warranty/warranty.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHIPPING_FEE       = 15.0;
const EXPRESS_DELIVERY_FEE = 25.0;
const FREE_SHIPPING_FROM = 50.0;
const POINTS_PER_DOLLAR  = 1;

/**
 * Resolve the shipping option for an order from the live site settings.
 * Returns the chosen method ("free" | "standard" | "express"), the fee to
 * charge, and the estimated delivery window to display on the receipt.
 */
async function resolveShippingConfig(subtotal: number): Promise<{
  method: "free" | "standard" | "express";
  fee: number;
  estimatedDelivery: string;
  expressFee: number;
}> {
  // Defaults mirror AdminSettingsClient → Shipping & Delivery card
  let freeEnabled = true;
  let freeThreshold = FREE_SHIPPING_FROM;
  let standardFee = SHIPPING_FEE;
  let expressFee = EXPRESS_DELIVERY_FEE;
  let estimatedDelivery = "2-4 business days";

  try {
    const settings: any = await getSiteSettings();
    const s = settings?.shipping || {};
    if (typeof s.freeShippingEnabled === "boolean") freeEnabled = s.freeShippingEnabled;
    if (typeof s.freeShippingThreshold === "number") freeThreshold = s.freeShippingThreshold;
    if (typeof s.standardDeliveryFee === "number") standardFee = s.standardDeliveryFee;
    if (typeof s.expressDeliveryFee === "number") expressFee = s.expressDeliveryFee;
    if (typeof s.estimatedDeliveryDays === "string" && s.estimatedDeliveryDays.trim()) {
      estimatedDelivery = s.estimatedDeliveryDays;
    }
  } catch {
    // Backend unreachable — fall back to the constants above
  }

  if (freeEnabled && subtotal >= freeThreshold) {
    return { method: "free", fee: 0, estimatedDelivery, expressFee };
  }
  return { method: "standard", fee: standardFee, estimatedDelivery, expressFee };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the membership tier for a given loyalty points total. */
export function getMembershipTier(points: number): "silver" | "gold" | "platinum" | "diamond" {
  if (points >= 10000) return "diamond";
  if (points >= 4000)  return "platinum";
  if (points >= 1000)  return "gold";
  return "silver";
}

/** Order item references may be raw ids or populated documents. */
function orderItemProductId(item: any) {
  const ref = item.productId;
  return typeof ref === "object" && ref !== null && "_id" in ref ? ref._id : ref;
}

/** Loads every ordered product, verifies stock, and builds the priced line items. */
async function buildOrderItems(items: CreateOrderInput["items"]) {
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);
    if (product.stockQuantity != null && product.stockQuantity < item.quantity) {
      throw new ApiError(400, `Insufficient stock for ${product.title}`);
    }

    subtotal += product.price * item.quantity;
    orderItems.push({
      productId: product._id,
      title:     product.title,
      price:     product.price,
      quantity:  item.quantity,
      image:     product.image || item.image || "",
    });
  }

  return { orderItems, subtotal };
}

/**
 * An explicit choice from checkout wins; otherwise the fee and delivery window
 * are derived from the live site settings.
 */
async function resolveShipping(subtotal: number, requested?: "free" | "standard" | "express") {
  const resolved = await resolveShippingConfig(subtotal);
  if (!requested) return resolved;

  const fee =
    requested === "free"    ? 0 :
    requested === "express" ? resolved.expressFee :
    resolved.method === "free" ? 0 : resolved.fee;

  return { method: requested, fee, estimatedDelivery: resolved.estimatedDelivery };
}

/** Free-text search over customer name, city, payment method and ids. */
function buildOrderSearchCondition(search: string) {
  const q = search.trim();
  const matches: any[] = [
    { "shippingAddress.fullName": { $regex: q, $options: "i" } },
    { "shippingAddress.city":     { $regex: q, $options: "i" } },
    { paymentMethod:              { $regex: q, $options: "i" } },
  ];
  if (/^[0-9a-fA-F]{24}$/.test(q)) matches.push({ _id: q }, { userId: q });
  return { $or: matches };
}

/**
 * Cancelling: fail the payment, retire any warranty coverage, and undo the
 * sellCount the order contributed if it had already been delivered.
 */
async function applyCancellation(order: any, orderId: string) {
  await Transaction.updateMany(
    { orderId, status: { $ne: "failed" } },
    { $set: { status: "failed" } }
  );

  try {
    await voidWarrantiesForOrder(orderId);
  } catch (warrantyErr) {
    console.error("[WARRANTY] Failed to void warranties for order", orderId, warrantyErr);
  }

  if (order.orderStatus !== "delivered") return;

  for (const item of order.items || []) {
    const productId = orderItemProductId(item);
    if (productId && item.quantity) {
      await Product.findByIdAndUpdate(productId, { $inc: { sellCount: -item.quantity } });
    }
  }
}

/**
 * Delivery: settle the payment, then (on the first delivery only) count the
 * sale, credit loyalty points, re-check the tier, and issue warranties.
 */
async function applyDelivery(order: any, orderId: string, previousStatus: string) {
  await Transaction.updateMany(
    { orderId, status: { $ne: "success" } },
    { $set: { status: "success" } }
  );

  if (previousStatus === "delivered") return;

  for (const item of order.items || []) {
    const productId = orderItemProductId(item);
    if (productId && item.quantity) {
      await Product.findByIdAndUpdate(productId, { $inc: { sellCount: item.quantity } });
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    order.userId,
    { $inc: { points: order.pointsEarned } },
    { new: true }
  );

  if (updatedUser) {
    const points  = typeof updatedUser.points === "number" && !isNaN(updatedUser.points) ? updatedUser.points : 0;
    const newTier = getMembershipTier(points);
    if (updatedUser.member !== newTier) {
      await User.findByIdAndUpdate(order.userId, { $set: { member: newTier } });
    }
  }

  // Idempotent — one warranty per (user, product, order).
  try {
    await createWarrantiesForOrder(orderId, order.userId.toString(), order.items || []);
  } catch (warrantyErr) {
    console.error("[WARRANTY] Failed to create warranties for order", orderId, warrantyErr);
  }
}

// ─── Create Order ─────────────────────────────────────────────────────────────

export async function createOrder(data: CreateOrderInput, userId: string) {
  if (data.paymentMethod !== "cod" && !data.transactionId) {
    throw new ApiError(400, "Transaction ID required for wallet payments");
  }

  const { orderItems, subtotal } = await buildOrderItems(data.items);
  const shipping = await resolveShipping(subtotal, data.shippingMethod);

  const totalAmount  = subtotal + shipping.fee;
  const pointsEarned = Math.floor(subtotal * POINTS_PER_DOLLAR);

  // Save order
  const order = await Order.create({
    userId,
    items: orderItems,
    shippingAddress: data.shippingAddress,
    paymentMethod: data.paymentMethod,
    subtotal,
    shippingFee: shipping.fee,
    totalAmount,
    shippingMethod: shipping.method,
    estimatedDelivery: shipping.estimatedDelivery,
    pointsEarned,
  });

  // Create transaction record
  const reference = data.paymentMethod === "cod" ? `COD-${order._id}` : data.transactionId!;
  await createTransaction({
    orderId:  order._id.toString(),
    userId,
    method:   data.paymentMethod,
    amount:   totalAmount,
    reference,
  });

  // Log initial status
  await logOrderStatus(order._id.toString(), "processing");

  // Deduct stock and clear cart
  for (const item of data.items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stockQuantity: -item.quantity } });
  }
  await Cart.deleteMany({ userId });

  return order;
}

// ─── Get Orders ───────────────────────────────────────────────────────────────

export async function getOrders(query: GetOrdersQuery) {
  const { userId, status, search, sort, page, limit } = query;
  const conditions: any[] = [];

  if (userId) conditions.push({ userId });
  if (status && status !== "all") conditions.push({ orderStatus: status.toLowerCase() });

  if (search?.trim()) conditions.push(buildOrderSearchCondition(search));

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest:     { createdAt: -1 },
    oldest:     { createdAt:  1 },
    total_asc:  { totalAmount:  1 },
    total_desc: { totalAmount: -1 },
  };
  const sortCriteria = sortMap[sort ?? ""] ?? { createdAt: -1 };

  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("userId", "name email image avatar")
      .populate("items.productId")
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    orders,
    total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Order By ID ──────────────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const order = await Order.findById(id)
    .populate("userId", "name email image avatar")
    .populate("items.productId");
  if (!order) throw new ApiError(404, "Order not found");

  const transaction = await getLatestTransactionForOrder(id);

  return {
    ...order.toObject(),
    transactionId: transaction?.reference,
    paymentStatus: transaction?.status,
  };
}

// ─── Update Order Status (Admin) ──────────────────────────────────────────────

export async function updateOrderStatus(id: string, data: UpdateOrderStatusInput) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Order not found");

  // Cannot cancel a shipped order until the customer has responded
  if (order.orderStatus === "shipped" && data.orderStatus === "cancelled" && !order.customerResponse) {
    throw new ApiError(400, "Customer must respond before a shipped order can be cancelled");
  }

  const updated = await Order.findByIdAndUpdate(id, data, { new: true });
  if (!updated) throw new ApiError(404, "Order not found");

  await logOrderStatus(id, data.orderStatus);

  // Settle the side effects of the new status. These need the *previous*
  // status, which is why the original document is kept around.
  if (data.orderStatus === "cancelled") {
    await applyCancellation(order, id);
  }

  if (data.orderStatus === "delivered") {
    await applyDelivery(updated, id, order.orderStatus);
  }

  return updated;
}

// ─── Customer Order Response ───────────────────────────────────────────────────

export async function updateCustomerResponse(
  id: string,
  data: CustomerResponseInput,
  requester?: { id?: string; role?: string }
) {
  const order = await Order.findById(id);
  if (!order) throw new ApiError(404, "Order not found");

  assertOwnerOrAdmin(order.userId, requester, "You are not authorized to respond to this order");

  if (order.orderStatus !== "shipped") {
    throw new ApiError(400, "Response can only be submitted when the order is shipped");
  }

  order.customerResponse     = data.response;
  order.customerResponseNote = data.note ?? order.customerResponseNote;
  order.customerResponseAt   = new Date();
  await order.save();

  const noteLog = data.note ? ` - "${data.note}"` : "";
  await logOrderStatus(id, order.orderStatus, `Customer response: ${data.response}${noteLog}`);

  return order;
}