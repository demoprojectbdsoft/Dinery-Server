import mongoose from "mongoose";
import { UNDO_COLLECTION } from "./demo.plugin";
import { toObjectId } from "../../utils/ids";

type Counts = { removed: number; restored: number };

/**
 * Undo everything the demo admin did: delete what they added, put back what
 * they edited or deleted. Real admin changes are never in the log, so they stay.
 * Safe to run twice — the log is cleared as it is applied.
 *
 * The report names every collection that changed, so the nightly cron output
 * shows at a glance whether the demo screens really were reverted.
 */
export async function restoreDemoChanges() {
  const log = mongoose.connection.collection(UNDO_COLLECTION);
  const entries = await log.find().toArray();

  const restoredAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const restoredAtLocal = restoredAt.toISOString().replace("Z", "+06:00");

  const byCollection: Record<string, Counts> = {};
  const count = (coll: string, key: keyof Counts) => {
    byCollection[coll] = byCollection[coll] || { removed: 0, restored: 0 };
    byCollection[coll][key]++;
  };

  const totals: Counts = { removed: 0, restored: 0 };

  if (!entries || entries.length === 0) {
    return {
      restoredAt,
      restoredAtLocal,
      timezone: "UTC+6",
      removed: 0,
      restored: 0,
      entries: 0,
      byCollection,
    };
  }

  // 1) delete what the demo admin created (first, so unique slugs can't clash)
  for (const entry of entries.filter((e) => e.before === null)) {
    const rawId = entry.docId;
    const objectId = toObjectId(rawId);
    await mongoose.connection
      .collection(entry.coll)
      .deleteOne({ _id: { $in: [rawId, objectId] } });
    totals.removed++;
    count(entry.coll, "removed");
  }

  // 2) put back what the demo admin edited or deleted
  for (const entry of entries.filter((e) => e.before !== null)) {
    const rawId = entry.docId;
    const objectId = toObjectId(rawId);
    const targetId = entry.before._id ? toObjectId(entry.before._id) : objectId;

    await mongoose.connection
      .collection(entry.coll)
      .replaceOne({ _id: targetId }, entry.before, { upsert: true });
    totals.restored++;
    count(entry.coll, "restored");
  }

  await log.deleteMany({ _id: { $in: entries.map((e) => e._id) } });

  // A one-line summary is easier to read in a cron log than a nested object.
  const summary = Object.entries(byCollection)
    .map(([coll, value]) => `${coll} -${value.removed}/+${value.restored}`)
    .join(", ");
  console.log(`[demo] Restored ${entries.length} change(s): ${summary || "nothing to restore"}`);

  return {
    restoredAt,
    restoredAtLocal,
    timezone: "UTC+6",
    ...totals,
    entries: entries.length,
    byCollection,
  };
}
