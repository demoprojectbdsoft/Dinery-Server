import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/apiError";
import { ENV } from "../config/env";
import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

import { demoStore, isDemoAdmin } from "../modules/demo/demo.context";

type AuthUser = {
  id: string;
  email?: string;
  role?: string;
};

const JWKS = createRemoteJWKSet(new URL(`${ENV.NEXT_PUBLIC_CLIENT_URL}/api/auth/jwks`));

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Reads the bearer token from the Authorization header or a `?token=` param. */
function readToken(req: Request): string | undefined {
  return req.headers.authorization?.split(" ")[1] || (req.query.token as string | undefined);
}

/** Verifies a Better-Auth JWT against the frontend's JWKS endpoint. */
async function userFromJwt(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ENV.NEXT_PUBLIC_CLIENT_URL,
  });

  return {
    id: payload.sub as string,
    email: payload.email as string | undefined,
    role: payload.role as string | undefined,
  };
}

/**
 * Fallback for callers that send a Better-Auth *session* token rather than a
 * JWT: look the session up in the shared database and read the user behind it.
 */
async function userFromSession(token: string): Promise<AuthUser | null> {
  const mongoose = (await import("mongoose")).default;
  const db = mongoose.connection.db;

  const session = await db?.collection("session").findOne({ token });
  if (!session) return null;

  const rawUserId = session.userId;
  const objectId = mongoose.Types.ObjectId.isValid(String(rawUserId))
    ? new mongoose.Types.ObjectId(String(rawUserId))
    : rawUserId;

  const user = await db?.collection("user").findOne({
    $or: [{ _id: rawUserId }, { _id: objectId }],
  });
  if (!user) return null;

  return { id: String(user._id), email: user.email, role: user.role };
}

/**
 * Re-reads the role from the database after a JWT check.
 *
 * A JWT carries the role it was minted with, so an account promoted to rider
 * (or demoted) would keep its old authority until the token expires. The
 * backend must apply the change on the next request, not fifteen minutes later.
 * A missing account is treated as signed out.
 */
async function withCurrentRole(user: AuthUser): Promise<AuthUser | null> {
  try {
    const mongoose = (await import("mongoose")).default;
    const db = mongoose.connection.db;
    if (!db) return user;

    const objectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : user.id;

    const record: any = await db.collection("user").findOne({
      $or: [{ _id: user.id }, { _id: objectId }],
    } as any);

    if (!record) return null;
    return { ...user, role: record.role ?? user.role, email: record.email ?? user.email };
  } catch {
    // A database hiccup must not sign everybody out: the token was valid.
    return user;
  }
}

/**
 * Resolves the caller once, then lets the request continue. Demo admin
 * requests are flagged for the whole request so the undo plugin can snapshot
 * every write they make.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) {
    return next(new ApiError(401, "No token provided"));
  }

  let user: AuthUser | null = null;
  let resolvedFromJwt = false;
  try {
    user = await userFromJwt(token);
    resolvedFromJwt = true;
  } catch {
    user = await userFromSession(token);
  }

  // The session fallback already read the user row, so only the JWT path needs
  // the extra query for a fresh role.
  if (user && resolvedFromJwt) {
    user = await withCurrentRole(user);
  }

  if (!user) {
    return next(new ApiError(401, "Invalid or expired token"));
  }

  req.user = user;

  if (isDemoAdmin(user.email, user.role)) {
    return demoStore.run({ demo: true }, () => next());
  }
  return next();
}
