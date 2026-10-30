import { Types } from "mongoose";
import {
  Delivery,
  ACTIVE_DELIVERY_STATUSES,
  FINISHED_DELIVERY_STATUSES,
  DeliveryStatus,
} from "./delivery.model";
import { GetRiderDeliveriesQuery, RiderStatsQuery } from "./delivery.validator";

/**
 * Everything the rider's own screens read.
 *
 * Every query starts from the caller's id, never from a value in the request,
 * so one rider can never see another rider's jobs.
 */

/** "#ORD-A1B2C3" — the short form the dashboards show. */
export function shortOrderNumber(id: unknown): string {
  return `#ORD-${String(id).slice(-6).toUpperCase()}`;
}

/** A delivery as the app reads it: ids as strings, dates as ISO strings. */
function toDto(delivery: any) {
  return {
    _id: String(delivery._id),
    orderId: String(delivery.orderId),
    orderNumber: shortOrderNumber(delivery.orderId),
    status: delivery.status as DeliveryStatus,
    customerName: delivery.customerName || "",
    customerPhone: delivery.customerPhone || "",
    address: delivery.address || "",
    city: delivery.city || "",
    items: Number(delivery.items || 0),
    orderTotal: Number(delivery.orderTotal || 0),
    fee: Number(delivery.fee || 0),
    distanceKm: delivery.distanceKm ?? null,
    declineReason: delivery.declineReason || "",
    expiresAt: delivery.expiresAt ? new Date(delivery.expiresAt).toISOString() : null,
    acceptedAt: delivery.acceptedAt ? new Date(delivery.acceptedAt).toISOString() : null,
    pickedUpAt: delivery.pickedUpAt ? new Date(delivery.pickedUpAt).toISOString() : null,
    outForDeliveryAt: delivery.outForDeliveryAt
      ? new Date(delivery.outForDeliveryAt).toISOString()
      : null,
    deliveredAt: delivery.deliveredAt ? new Date(delivery.deliveredAt).toISOString() : null,
    cancelledAt: delivery.cancelledAt ? new Date(delivery.cancelledAt).toISOString() : null,
    createdAt: new Date(delivery.createdAt).toISOString(),
    updatedAt: new Date(delivery.updatedAt).toISOString(),
  };
}

/** Midnight-to-midnight key for the day a moment belongs to. */
function dayKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/** The last `days` day keys, oldest first, so a quiet day is still a point. */
function recentDayKeys(days: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

/** Minutes between two moments, or null when either is missing. */
function minutesBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to) return null;
  const diff = to.getTime() - from.getTime();
  return diff >= 0 ? diff / 60_000 : null;
}

/**
 * The overview numbers.
 *
 * A rider's job count is small enough to fold in one pass rather than in a
 * dozen round trips, and one pass keeps every figure consistent with the others.
 */
export async function getRiderStats(riderId: string, query: RiderStatsQuery) {
  const days = query.days;
  const rider = new Types.ObjectId(riderId);

  // One read of the rider's jobs, oldest first: totals, the chart series and the
  // delivery-time average all come from the same snapshot.
  const deliveries = await Delivery.find({ riderId: rider }).sort({ createdAt: 1 }).lean();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayKeys = recentDayKeys(days);
  const daySeries = new Map(dayKeys.map((key) => [key, { delivered: 0, earnings: 0, cancelled: 0 }]));

  const statusCounts: Record<string, number> = {
    assigned: 0,
    accepted: 0,
    picked_up: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
    declined: 0,
  };

  let earnings = 0;
  let earningsThisMonth = 0;
  let earningsInWindow = 0;
  let activeCount = 0;
  let pendingRequests = 0;
  let completed = 0;
  let cancelled = 0;
  let deliveryMinutes = 0;
  let deliverySamples = 0;

  for (const delivery of deliveries) {
    const status = delivery.status as DeliveryStatus;
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    if (ACTIVE_DELIVERY_STATUSES.includes(status)) activeCount++;
    if (status === "assigned") {
      // A request past its expiry is no longer a job the rider can take.
      const expired = delivery.expiresAt && new Date(delivery.expiresAt).getTime() < now.getTime();
      if (!expired) pendingRequests++;
    }

    if (status === "delivered") {
      completed++;
      const fee = Number(delivery.fee || 0);
      const deliveredAt = delivery.deliveredAt ? new Date(delivery.deliveredAt) : null;

      earnings += fee;
      if (deliveredAt && deliveredAt >= monthStart) earningsThisMonth += fee;

      const key = deliveredAt ? dayKey(deliveredAt) : "";
      const bucket = daySeries.get(key);
      if (bucket) {
        bucket.delivered += 1;
        bucket.earnings += fee;
        earningsInWindow += fee;
      }

      const minutes = minutesBetween(
        delivery.acceptedAt ? new Date(delivery.acceptedAt) : null,
        deliveredAt
      );
      if (minutes !== null) {
        deliveryMinutes += minutes;
        deliverySamples++;
      }
    }

    if (status === "cancelled") {
      cancelled++;
      const cancelledAt = delivery.cancelledAt ? new Date(delivery.cancelledAt) : null;
      if (cancelledAt) {
        const bucket = daySeries.get(dayKey(cancelledAt));
        if (bucket) bucket.cancelled += 1;
      }
    }
  }

  const finished = completed + cancelled;
  const successRate = finished > 0 ? Math.round((completed / finished) * 100) : 0;
  const avgDeliveryMinutes = deliverySamples > 0 ? Math.round(deliveryMinutes / deliverySamples) : 0;

  // The table on the overview: the jobs that moved most recently, newest first.
  const recent = [...deliveries]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8)
    .map(toDto);

  return {
    stats: {
      totalDeliveries: deliveries.length,
      completed,
      active: activeCount,
      pendingRequests,
      cancelled,
      earnings,
      earningsThisMonth,
      earningsInWindow,
      successRate,
      avgDeliveryMinutes,
    },
    statusCounts,
    series: dayKeys.map((key) => {
      const bucket = daySeries.get(key)!;
      return {
        date: key,
        delivered: bucket.delivered,
        cancelled: bucket.cancelled,
        earnings: Math.round(bucket.earnings * 100) / 100,
      };
    }),
    recent,
    range: { days, from: dayKeys[0], to: dayKeys[dayKeys.length - 1] },
  };
}

/** The rider's own jobs, filtered and paged. */
export async function getRiderDeliveries(riderId: string, query: GetRiderDeliveriesQuery) {
  const { status, search, sort, page, limit } = query;
  const conditions: any[] = [{ riderId: new Types.ObjectId(riderId) }];

  if (status === "active") {
    conditions.push({ status: { $in: ACTIVE_DELIVERY_STATUSES } });
  } else if (status === "finished") {
    conditions.push({ status: { $in: FINISHED_DELIVERY_STATUSES } });
  } else if (status !== "all") {
    conditions.push({ status });
  }

  if (search?.trim()) {
    const q = search.trim();
    const matches: any[] = [
      { customerName: { $regex: q, $options: "i" } },
      { city: { $regex: q, $options: "i" } },
      { address: { $regex: q, $options: "i" } },
      { customerPhone: { $regex: q, $options: "i" } },
    ];
    if (/^[0-9a-fA-F]{24}$/.test(q)) matches.push({ _id: q }, { orderId: q });
    conditions.push({ $or: matches });
  }

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    fee_desc: { fee: -1, createdAt: -1 },
  };

  const filter = { $and: conditions };
  const [deliveries, total] = await Promise.all([
    Delivery.find(filter)
      .sort(sortMap[sort] ?? sortMap.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Delivery.countDocuments(filter),
  ]);

  return {
    deliveries: deliveries.map(toDto),
    total,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
