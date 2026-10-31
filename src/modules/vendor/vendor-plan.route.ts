import { Router } from "express";
import { validate } from "../../utils/validate";
import { updatePlanSchema } from "./vendor-plan.validator";
import * as controller from "./vendor-plan.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Public: the application's plan step and the pricing pages read this.
router.get("/", controller.listPlans);

// The store team owns the numbers.
router.patch(
  "/:planId",
  requireAuth,
  requireRole("admin"),
  validate(updatePlanSchema),
  controller.updatePlan
);

export default router;
