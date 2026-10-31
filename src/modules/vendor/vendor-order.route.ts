import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { validate } from "../../utils/validate";
import * as controller from "./vendor-order.controller";
import { vendorOrderStatusSchema } from "./vendor-order.validator";

const router = Router();

router.use(requireAuth, requireRole("vendor"));

router.get("/", controller.listMyOrders);
// Before `/:id`, otherwise "summary" would be read as an order id.
router.get("/summary", controller.getOrderSummary);
router.get("/:id", controller.getMyOrder);
router.patch("/:id/status", validate(vendorOrderStatusSchema), controller.updateMyOrderStatus);

export default router;
