import { ClientSession } from "mongoose";
import { Transaction } from "./transaction.model";
import { GetTransactionsQuery } from "./transaction.validator";

export type PaymentMethod = "cod" | "bkash" | "rocket" | "nagad";

/** Records the payment row for an order, optionally inside a caller's session. */
export async function createTransaction(
  params: {
    orderId: string;
    userId: string;
    method: PaymentMethod;
    amount: number;
    reference: string;
  },
  session?: ClientSession
) {
  const transaction = new Transaction({
    ...params,
    status: params.method === "cod" ? "pending" : "success",
  });

  await transaction.save({ session });
  return transaction;
}

export async function getLatestTransactionForOrder(orderId: string) {
  return Transaction.findOne({ orderId }).sort({ createdAt: -1 });
}

export async function getTransactions(query: GetTransactionsQuery) {
  const { userId, orderId, status, method, search, sort, page = 1, limit = 10 } = query;
  const conditions: any[] = [];

  if (userId) conditions.push({ userId });
  if (orderId) conditions.push({ orderId });
  if (status && status !== "all") conditions.push({ status: status.toLowerCase() });
  if (method && method !== "all") conditions.push({ method: method.toLowerCase() });

  if (search?.trim()) {
    const q = search.trim();
    const isId = /^[0-9a-fA-F]{24}$/.test(q);
    const searchOr: any[] = [
      { reference: { $regex: q, $options: "i" } },
      { method: { $regex: q, $options: "i" } },
    ];
    if (isId) searchOr.push({ _id: q }, { userId: q }, { orderId: q });
    conditions.push({ $or: searchOr });
  }

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount_asc: { amount: 1 },
    amount_desc: { amount: -1 },
  };
  const sortCriteria = sortMap[sort ?? ""] ?? { createdAt: -1 };

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find(filter)
      .populate("userId", "name email image avatar")
      .populate("orderId")
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  return {
    transactions,
    total,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}