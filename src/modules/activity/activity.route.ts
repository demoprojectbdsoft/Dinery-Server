import { Router } from "express";
import * as activityController from "./activity.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// The feed names orders, payments and people, so it is for the store team only.
router.use(requireAuth, requireRole("admin"));

router.get("/", activityController.getActivities);

export default router;
