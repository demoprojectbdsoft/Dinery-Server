import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import * as controller from "./vendor-analytics.controller";

const router = Router();

router.use(requireAuth, requireRole("vendor"));

router.get("/", controller.getMyAnalytics);

export default router;
