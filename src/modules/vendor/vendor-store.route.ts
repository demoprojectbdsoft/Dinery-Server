import { Router } from "express";
import { validate } from "../../utils/validate";
import { updateStoreSchema } from "./vendor-store.validator";
import * as controller from "./vendor-store.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// The signed-in vendor's own shop. Every route resolves the store from the
// token, so there is deliberately no "/:id" here.
router.get("/mine", requireAuth, requireRole("vendor"), controller.getMyStore);
router.patch(
  "/mine",
  requireAuth,
  requireRole("vendor"),
  validate(updateStoreSchema),
  controller.updateMyStore
);

export default router;
