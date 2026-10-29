import { Router, Request, Response, NextFunction } from "express";
import { ApiError } from "../../utils/apiError";
import * as demoController from "./demo.controller";

import { requireAuth } from "../../middlewares/auth.middleware";

// Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>` or `x-vercel-cron: "1"`.
function isCronInvocation(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization === `Bearer ${secret}`) return true;
  return req.headers["x-vercel-cron"] === "1";
}

// Allows cron, or an authenticated Store Admin triggering a manual restore.
function requireCronOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (isCronInvocation(req)) return next();

  return requireAuth(req, res, (err?: any) => {
    if (err) {
      return next(new ApiError(401, "Unauthorized: Valid CRON_SECRET, Vercel Cron, or Admin token required"));
    }
    const role = (req.user?.role || "").toLowerCase();
    if (role === "admin") {
      return next();
    }
    return next(new ApiError(403, "Forbidden: Store Admin privileges required"));
  });
}

const router = Router();

router.get("/restore", requireCronOrAdmin, demoController.restoreDemoChanges); // Vercel Cron only makes GET requests
router.post("/restore", requireCronOrAdmin, demoController.restoreDemoChanges); // Convenient for API/manual calls

export default router;