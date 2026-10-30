import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { requireCronOrAdmin } from "../../middlewares/cron.middleware";
import * as warrantyController from "./warranty.controller";

const router = Router();

// Customer: list their own warranties
router.get("/mine", requireAuth, warrantyController.getMyWarranties);
// Customer: fetch the warranty record for one order item (used by the order history "Claim" button)
router.get("/order/:orderId/product/:productId", requireAuth, warrantyController.getWarrantyForOrderItem);
// Customer: submit a claim, or reply when the store asked for more information
router.post("/claim/:id", requireAuth, warrantyController.submitClaim);

// Scheduled: close lapsed warranties. Called by Vercel Cron, and callable by
// an admin by hand. Kept above the "/" and "/claim/:id" routes so the method and
// path pairs never overlap with the customer endpoints.
router.get("/expire", requireCronOrAdmin, warrantyController.expireWarranties);

// Admin: list all warranties
router.get("/", requireAuth, requireRole("admin"), warrantyController.getAllWarranties);
// Admin: process a claim
router.patch("/claim/:id", requireAuth, requireRole("admin"), warrantyController.adminUpdateClaim);
// Admin: email the customer about this warranty
router.post("/email/:id", requireAuth, requireRole("admin"), warrantyController.emailCustomer);

export default router;
