import { ClientSession } from "mongoose";
import { Order } from "./order.model";
import { Product } from "../product/product.model";
import { Cart } from "../cart/cart.model";
import { User } from "../user/user.model";
import { Transaction } from "../transaction/transaction.model";
import { ApiError } from "../../utils/apiError";
import { assertOwnerOrAdmin } from "../../utils/authz";
import { withTransaction } from "../../utils/transactions";
import { CreateOrderInput, UpdateOrderStatusInput, CustomerResponseInput, GetOrdersQuery } from "./order.validator";
import { isAllowedTransition, nextStatuses } from "./order.flow";
import { logOrderStatus } from "../order-status/order-status.service";
import { createTransaction, getLatestTransactionForOrder } from "../transaction/transaction.service";
import { getSiteSettings } from "../site-settings/site-settings.service";
import { createWarrantiesForOrder, voidWarrantiesForOrder } from "../warranty/warranty.service";
import {
  IssuedWarranty,
  notifyWarrantiesIssued,
} from "../warranty/warranty.notifications";
import { recordActivity } from "../activity/activity.service";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHIPPING_FEE       = 15.0;
const EXPRESS_DELIVERY_FEE = 25.0;
const FREE_SHIPPING_FROM = 50.0;
const POINTS_PER_DOLLAR  = 1;
/** 100 loyalty points convert into 1 currency unit at checkout. */
const POINTS_PER_CURRENCY = 100;
/** Below one full unit there is nothing worth deducting. */
const MIN_POINTS_TO_REDEEM = 100;

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

/** Writes the tier that matches the user's current points balance. */
async function syncMembershipTier(user: any, session?: ClientSession) {
  const points = typeof user.points === "number" && !isNaN(user.points) ? user.points : 0;
  const tier = getMembershipTier(points);

  if (user.member !== tier) {
    await User.findByIdAndUpdate(user._id, { $set: { member: tier } }, { session });
  }
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
 * Cancelling: fail the payment, retire any warranty coverage, put the stock
 * back, and — when the order had already been delivered — undo the sale and
 * the loyalty points it paid out.
 */
async function applyCancellation(
  order: any,
  orderId: string,
  previousStatus: string,
  session?: ClientSession
) {
  await Transaction.updateMany(
    { orderId, status: { $ne: "failed" } },
    { $set: { status: "failed" } },
    { session }
  );

  // Errors are left to bubble up: the transaction then rolls the whole
  // cancellation back instead of leaving warranties open on a cancelled order.
  await voidWarrantiesForOrder(orderId, session);

  const wasDelivered = previousStatus === "delivered";

  for (const item of order.items || []) {
    const productId = orderItemProductId(item);
    if (!productId || !item.quantity) continue;

    // Delivery counted this as a sale, so a return undoes the count even for a
    // product that is not stock-tracked.
    if (wasDelivered) {
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { sellCount: -item.quantity } },
        { session }
      );
    }

    // Only a tracked product has a number to give back. The guard keeps `$inc`
    // away from a missing field, which it would otherwise turn into NaN.
    await Product.updateOne(
      { _id: productId, stockQuantity: { $ne: null } },
      { $inc: { stockQuantity: item.quantity } },
      { session }
    );
  }

  // Points spent at checkout are always returned, delivered or not.
  if (order.pointsRedeemed) {
    const refundedUser = await User.findByIdAndUpdate(
      order.userId,
      { $inc: { points: order.pointsRedeemed } },
      { new: true, session }
    );
    if (refundedUser) await syncMembershipTier(refundedUser, session);
  }

  if (!wasDelivered || !order.pointsEarned) return;

  // Delivery credited these points, so a return takes them back and re-checks
  // the tier the customer belongs to now.
  const updatedUser = await User.findByIdAndUpdate(
    order.userId,
    { $inc: { points: -order.pointsEarned } },
    { new: true, session }
  );
  if (updatedUser) await syncMembershipTier(updatedUser, session);
}

/**
 * Delivery: settle the payment, then (on the first delivery only) count the
 * sale, credit loyalty points, re-check the tier, and issue warranties.
 */
async function applyDelivery(
  order: any,
  orderId: string,
  previousStatus: string,
  session?: ClientSession
): Promise<IssuedWarranty[]> {
  await Transaction.updateMany(
    { orderId, status: { $ne: "success" } },
    { $set: { status: "success" } },
    { session }
  );

  if (previousStatus === "delivered") return [];

  for (const item of order.items || []) {
    const productId = orderItemProductId(item);
    if (productId && item.quantity) {
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { sellCount: item.quantity } },
        { session }
      );
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    order.userId,
    { $inc: { points: order.pointsEarned } },
    { new: true, session }
  );

  if (updatedUser) {
    await syncMembershipTier(updatedUser, session);
  }

  // Idempotent — one warranty per (user, product, order). A failure here rolls
  // the delivery back, so retrying it cannot settle the order twice. The
  // summaries are returned so the confirmation email can go out after commit.
  return createWarrantiesForOrder(orderId, order.userId.toString(), order.items || [], session);
}

/**
 * Turns requested loyalty points into a cash discount and takes them off the
 * customer's balance. The guarded update only matches when the balance still
 * covers the request, so two tabs can never spend the same points twice.
 */
async function redeemPoints(
  userId: string,
  subtotal: number,
  requested: number,
  session?: ClientSession
) {
  const pointsToRedeem = Math.floor(requested);

  if (pointsToRedeem < MIN_POINTS_TO_REDEEM) {
    throw new ApiError(400, `Redeem at least ${MIN_POINTS_TO_REDEEM} points`);
  }

  // Points pay for products only - the delivery fee is always collected.
  const maxPointsForOrder = Math.floor(subtotal * POINTS_PER_CURRENCY);
  if (pointsToRedeem > maxPointsForOrder) {
    throw new ApiError(400, "Points can only cover the product total, not the delivery fee");
  }

  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, points: { $gte: pointsToRedeem } },
    { $inc: { points: -pointsToRedeem } },
    { new: true, session }
  );

  if (!updatedUser) {
    throw new ApiError(400, "You do not have enough reward points");
  }

  await syncMembershipTier(updatedUser, session);

  return {
    pointsRedeemed: pointsToRedeem,
    pointsDiscount: pointsToRedeem / POINTS_PER_CURRENCY,
  };
}

// ─── Notification helpers ─────────────────────────────────────────────────────

/** The short "#ORD-A1B2C3" form the dashboard shows for an order. */
function shortOrderNumber(id: unknown): string {
  return `#ORD-${String(id).slice(-6).toUpperCase()}`;
}

/** "$129.00" — the shop trades in one currency, so no formatting table here. */
function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** How a payment method is named in the notification feed. */
const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on delivery",
  bkash: "bKash",
  rocket: "Rocket",
  nagad: "Nagad",
};

/** "Nihal Ahmed · 2 items · $129.00" for the order notification line. */
function orderSummary(order: {
  items: { quantity: number }[];
  shippingAddress?: { fullName?: string | null } | null;
  totalAmount: number;
}): string {
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return [
    order.shippingAddress?.fullName,
    `${units} item${units === 1 ? "" : "s"}`,
    money(order.totalAmount),
  ]
    .filter(Boolean)
    .join(" · ");
}

// ─── Create Order ─────────────────────────────────────────────────────────────

export async function createOrder(data: CreateOrderInput, userId: string) {
  if (data.paymentMethod !== "cod" && !data.transactionId) {
    throw new ApiError(400, "Transaction ID required for wallet payments");
  }

  // Pricing only reads, so it stays outside the transaction.
  const { orderItems, subtotal } = await buildOrderItems(data.items);
  const shipping = await resolveShipping(subtotal, data.shippingMethod);
  const pointsRequested = data.pointsToRedeem ?? 0;

  // The order, its payment row, its first timeline entry, the stock decrement,
  // the points deduction and the cart reset are one unit of work: either all of
  // them land or none.
  const order = await withTransaction(async (session) => {
    // Spending points validates the request and updates the balance, so it runs
    // inside the transaction as well.
    const redemption = pointsRequested
      ? await redeemPoints(userId, subtotal, pointsRequested, session)
      : { pointsRedeemed: 0, pointsDiscount: 0 };

    const totalAmount = subtotal + shipping.fee - redemption.pointsDiscount;
    // Points are earned on what is really paid for the products, never on the
    // part that points covered.
    const pointsEarned = Math.floor((subtotal - redemption.pointsDiscount) * POINTS_PER_DOLLAR);

    const order = new Order({
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
      pointsRedeemed: redemption.pointsRedeemed,
      pointsDiscount: redemption.pointsDiscount,
    });
    await order.save({ session });

    const orderId = order._id.toString();

    const reference = data.paymentMethod === "cod" ? `COD-${orderId}` : data.transactionId!;
    await createTransaction(
      { orderId, userId, method: data.paymentMethod, amount: totalAmount, reference },
      session
    );

    // A new order always enters the flow at "confirmed".
    await logOrderStatus(orderId, "confirmed", { session });

    for (const item of data.items) {
      // A product saved with no stock quantity is not stock-tracked, so it has
      // no number to lower. The filter skips those rows; without it `$inc`
      // would write NaN into the field.
      await Product.updateOne(
        { _id: item.productId, stockQuantity: { $ne: null } },
        { $inc: { stockQuantity: -item.quantity } },
        { session }
      );
    }
    await Cart.deleteMany({ userId }, { session });

    return order;
  });

  // Written after the commit on purpose: a rolled-back order never shows up as
  // a notification, and a feed problem can never undo a real order.
  const orderRef = order._id.toString();
  const shortNumber = shortOrderNumber(order._id);

  await recordActivity({
    type: "order",
    title: `New order ${shortNumber}`,
    detail: orderSummary(order),
    ref: orderRef,
  });

  // Cash on delivery is not money in hand yet: its payment row starts as
  // "pending" and only settles at delivery, so the line has to say the same
  // thing the transactions screen shows instead of claiming a payment landed.
  const paymentLabel = PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod;
  const isCashOnDelivery = order.paymentMethod === "cod";

  await recordActivity({
    type: "transaction",
    title: isCashOnDelivery
      ? `Cash on delivery order ${shortNumber}`
      : `Payment recorded for ${shortNumber}`,
    detail: isCashOnDelivery
      ? `${paymentLabel} · ${money(order.totalAmount)} due on delivery`
      : `${paymentLabel} · ${money(order.totalAmount)}`,
    ref: orderRef,
  });

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

export async function updateOrderStatus(
  id: string,
  data: UpdateOrderStatusInput,
  changedBy?: string
) {
  // Warranty confirmations are collected inside the transaction but only sent
  // after it commits, so a rolled-back delivery never announces coverage that
  // does not exist.
  let issuedWarranties: IssuedWarranty[] = [];
  // The status before this change, needed by the feed outside the transaction.
  let previousStatus = "";

  // The status write, the timeline entry and the settlement side effects must
  // not be left half-applied if one of them fails.
  const updated = await withTransaction(async (session) => {
    // Reads need the explicit session, otherwise they may see data from
    // before the transaction started. Writes just take a `{ session }` option,
    // which is harmless when there is no session.
    const order = session
      ? await Order.findById(id).session(session)
      : await Order.findById(id);
    if (!order) throw new ApiError(404, "Order not found");
    previousStatus = order.orderStatus;

    // Re-selecting the current stage is a no-op, not a new timeline row.
    if (order.orderStatus === data.orderStatus) return order;

    if (!isAllowedTransition(order.orderStatus, data.orderStatus)) {
      const allowed = nextStatuses(order.orderStatus);
      throw new ApiError(
        400,
        allowed.length > 0
          ? `A ${order.orderStatus} order can only move to: ${allowed.join(", ")}`
          : `This order is ${order.orderStatus} and can no longer be changed`
      );
    }

    // Once an order has shipped, the customer has to tell us what happened
    // before we can close it either way.
    if (order.orderStatus === "shipped" && !order.customerResponse) {
      throw new ApiError(
        400,
        "Customer must respond before a shipped order can be delivered or cancelled"
      );
    }

    // The customer already said it never arrived (or that they cancelled it),
    // so marking it delivered would contradict them.
    if (
      data.orderStatus === "delivered" &&
      (order.customerResponse === "not_received" || order.customerResponse === "cancelled")
    ) {
      throw new ApiError(
        400,
        `The customer reported "${order.customerResponse}", so this order cannot be marked delivered`
      );
    }

    // The other half of the same rule: once the customer confirms the parcel
    // arrived, delivery is the only way to close a shipped order.
    if (
      order.orderStatus === "shipped" &&
      data.orderStatus === "cancelled" &&
      order.customerResponse === "received"
    ) {
      throw new ApiError(
        400,
        "The customer confirmed receipt, so this order can only be marked delivered"
      );
    }

    const updated = await Order.findByIdAndUpdate(id, data, { new: true, session });
    if (!updated) throw new ApiError(404, "Order not found");

    await logOrderStatus(id, data.orderStatus, { session, changedBy });

    // Settle the side effects of the new status. These need the *previous*
    // status, which is why the original document is kept around.
    if (data.orderStatus === "cancelled") {
      await applyCancellation(order, id, order.orderStatus, session);
    }

    if (data.orderStatus === "delivered") {
      issuedWarranties = await applyDelivery(updated, id, order.orderStatus, session);
    }

    return updated;
  });

  // Cash on delivery settles at the door. applyDelivery just flipped its
  // payment row to "success", so this is the moment a payment really was
  // recorded — the checkout only promised one.
  const wasDelivered = previousStatus === "delivered";
  if (data.orderStatus === "delivered" && !wasDelivered && updated.paymentMethod === "cod") {
    await recordActivity({
      type: "transaction",
      title: `Payment collected for ${shortOrderNumber(updated._id)}`,
      detail: `Cash on delivery · ${money(updated.totalAmount)}`,
      ref: updated._id.toString(),
    });
  }

  if (issuedWarranties.length) {
    await notifyWarrantiesIssued(updated, issuedWarranties);
    await recordActivity({
      type: "warranty",
      title: `${issuedWarranties.length} warranty record${
        issuedWarranties.length === 1 ? "" : "s"
      } issued`,
      detail: `Order ${shortOrderNumber(updated._id)} was delivered`,
      ref: updated._id.toString(),
    });
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

  // "Received" and "Cancelled" are the customer's final word, so they cannot be
  // changed afterwards. "Not received" stays editable, because a late parcel can
  // still be confirmed later.
  const FINAL_RESPONSES = ["received", "cancelled"];
  if (order.customerResponse && FINAL_RESPONSES.includes(order.customerResponse)) {
    throw new ApiError(
      400,
      order.customerResponse === "received"
        ? "You already confirmed this order as received, so the response can no longer be changed."
        : "You already cancelled this order, so the response can no longer be changed."
    );
  }

  order.customerResponse     = data.response;
  order.customerResponseNote = data.note ?? order.customerResponseNote;
  order.customerResponseAt   = new Date();
  await order.save();

  const noteLog = data.note ? ` - "${data.note}"` : "";
  await logOrderStatus(id, order.orderStatus, {
    note: `Customer response: ${data.response}${noteLog}`,
    changedBy: requester?.id,
  });

  // A cancellation is the one status change the admin did not make, so it gets
  // its own line in the notification feed.
  if (data.response === "cancelled") {
    await recordActivity({
      type: "order_cancelled",
      title: `Order ${shortOrderNumber(order._id)} cancelled by the customer`,
      detail: data.note ? `Reason: ${data.note}` : "No reason given",
      ref: order._id.toString(),
    });
  }

  return order;
}