import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import * as warrantyController from "./warranty.controller";

const router = Router();

// Customer: list their own warranties
router.get("/mine", requireAuth, warrantyController.getMyWarranties);
// Customer: fetch the warranty record for one order item (used by the order history "Claim" button)
router.get("/order/:orderId/product/:productId", requireAuth, warrantyController.getWarrantyForOrderItem);
// Customer: submit a claim for one of their own warranties
router.post("/claim/:id", requireAuth, warrantyController.submitClaim);

// Admin: list all warranties
router.get("/", requireAuth, requireRole("admin"), warrantyController.getAllWarranties);
// Admin: process a claim
router.patch("/claim/:id", requireAuth, requireRole("admin"), warrantyController.adminUpdateClaim);

export default router;