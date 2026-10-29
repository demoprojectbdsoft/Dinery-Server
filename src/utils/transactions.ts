import mongoose, { ClientSession } from "mongoose";

/**
 * True when the database is a replica set or a sharded cluster.
 * A single (standalone) mongod server cannot run transactions.
 *
 * The answer never changes while the app is running, so we ask once and
 * remember it.
 */
let supported: boolean | undefined;

async function transactionsSupported(): Promise<boolean> {
  if (supported !== undefined) return supported;

  try {
    const info: any = await mongoose.connection.db?.admin().command({ hello: 1 });
    supported = Boolean(info?.setName) || info?.msg === "isdbgrid";
  } catch {
    supported = false;
  }

  return supported;
}

/**
 * Runs `work` inside one database transaction when the database supports it.
 * Otherwise the very same `work` runs normally.
 *
 * Either way `work` receives an optional `session`, so the services can simply
 * pass it to their queries and never care which database they are talking to.
 */
export async function withTransaction<T>(
  work: (session?: ClientSession) => Promise<T>
): Promise<T> {
  if (!(await transactionsSupported())) return work();

  const session = await mongoose.startSession();
  try {
    let result: T | undefined;

    // If anything inside `work` throws, MongoDB rolls back every write and
    // `withTransaction` throws the same error back to us.
    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result as T;
  } finally {
    await session.endSession();
  }
}
