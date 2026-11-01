import { Router } from "express";
import { validate } from "../../utils/validate";
import {
  createRiderApplicationSchema,
  riderStatusLookupSchema,
  reviewRiderApplicationSchema,
} from "./rider-application.validator";
import * as controller from "./rider-application.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { requireInternalKey } from "../../middlewares/internal.middleware";

const router = Router();

/**
 * Route order matters. The fixed paths come before `/:id`, otherwise Express
 * reads "mine" as an application id.
 */

// The auth layer asks this after it has checked the password.
router.post(
  "/status",
  requireInternalKey,
  validate(riderStatusLookupSchema),
  controller.getStatusForVerifiedEmail
);

// ─── Applicant ────────────────────────────────────────────────────────────────
router.get("/mine", requireAuth, controller.getMyApplication);
router.post("/mine/cancel", requireAuth, controller.cancelMyApplication);
router.post(
  "/",
  requireAuth,
  validate(createRiderApplicationSchema),
  controller.submitApplication
);

// ─── Store team ───────────────────────────────────────────────────────────────
router.get("/", requireAuth, requireRole("admin"), controller.listApplications);
router.get("/:id", requireAuth, requireRole("admin"), controller.getApplication);
router.patch(
  "/:id/review",
  requireAuth,
  requireRole("admin"),
  validate(reviewRiderApplicationSchema),
  controller.reviewApplication
);

export default router;
