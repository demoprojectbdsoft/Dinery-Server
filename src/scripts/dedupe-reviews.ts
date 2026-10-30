/**
 * One review per customer per product.
 *
 * The database enforces that with a unique index on (userId, productId), but the
 * index cannot be built while two reviews for the same pair already exist — the
 * server logs "Could not build the unique review index" and carries on without
 * it, which then lets a double submit slip through.
 *
 * This script finds those old duplicate pairs, keeps one review from each, and
 * deletes the rest. It then builds the index straight away, so the fix does not
 * wait for the next restart.
 *
 *   npx tsx src/scripts/dedupe-reviews.ts           # report only, deletes nothing
 *   npx tsx src/scripts/dedupe-reviews.ts --apply   # delete the extra copies
 *
 * Point .env at the database you want to clean (the same MONGODB_URI the server
 * uses), because the same duplicates are usually waiting in production too.
 */
import mongoose from "mongoose";
import { ENV } from "../config/env";

/** The collection name Mongoose gives the ProductReview model. */
const COLLECTION = "productreviews";

interface StoredReview {
  _id: any;
  userId?: any;
  productId?: any;
  rating?: number;
  comment?: string;
  createdAt?: Date;
}

/** "6641…::9932…" — the same pair, whether stored as ObjectId or as text. */
function pairKey(review: StoredReview): string {
  return `${String(review.userId)}::${String(review.productId)}`;
}

/**
 * The review worth keeping: the newest one. Two copies are seconds apart in
 * practice, and the later one is either the same text sent twice or the
 * customer correcting a rating they just picked — so the newest carries their
 * final opinion.
 */
function pickKeeper(reviews: StoredReview[]): StoredReview {
  return [...reviews].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return String(b._id).localeCompare(String(a._id));
  })[0];
}

async function main() {
  const apply = process.argv.includes("--apply");

  await mongoose.connect(ENV.MONGODB_URI);
  const collection = mongoose.connection.collection(COLLECTION);

  const reviews = (await collection
    .find({}, { projection: { userId: 1, productId: 1, rating: 1, comment: 1, createdAt: 1 } })
    .toArray()) as unknown as StoredReview[];

  console.log(`Read ${reviews.length} review(s) from ${COLLECTION}`);

  // A JavaScript grouping is easy to follow and the collection is small; the
  // database is only asked to do the two things it must do: read and delete.
  const groups = new Map<string, StoredReview[]>();
  for (const review of reviews) {
    const key = pairKey(review);
    const bucket = groups.get(key) || [];
    bucket.push(review);
    groups.set(key, bucket);
  }

  const duplicates = [...groups.values()].filter((bucket) => bucket.length > 1);
  if (duplicates.length === 0) {
    console.log("No duplicate pairs found");
  }

  let removed = 0;
  for (const bucket of duplicates) {
    const keeper = pickKeeper(bucket);
    const extra = bucket.filter((review) => String(review._id) !== String(keeper._id));

    console.log(`\n${pairKey(keeper)}`);
    console.log(`  keep   ${keeper._id}  (${keeper.createdAt || "no date"}, ${keeper.rating}*)`);
    for (const review of extra) {
      console.log(`  delete ${review._id}  (${review.createdAt || "no date"}, ${review.rating}*)`);
    }

    if (apply) {
      const result = await collection.deleteMany({
        _id: { $in: extra.map((review) => review._id) },
      });
      removed += result.deletedCount || 0;
      console.log(`  deleted ${result.deletedCount || 0}`);
    }
  }

  if (!apply) {
    console.log(`\nReport only. Re-run with --apply to delete ${duplicates.length} pair(s).`);
    await mongoose.disconnect();
    return;
  }

  console.log(`\nDeleted ${removed} duplicate review(s)`);

  // Build the index now, so the error stops appearing at the next start.
  try {
    await collection.createIndex({ userId: 1, productId: 1 }, { unique: true });
    console.log("Unique index userId_1_productId_1 is in place");
  } catch (err) {
    console.error("Still could not build the index:", (err as Error).message);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Dedupe failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
