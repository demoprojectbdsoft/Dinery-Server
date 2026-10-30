import { Router } from "express";
import * as deliveryController from "./delivery.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Every route here is "my own work": the rider id comes from the token.
router.use(requireAuth, requireRole("rider"));

router.get("/", deliveryController.getMyDeliveries);
router.get("/stats", deliveryController.getMyStats);

export default router;
