import { Router } from "express";
import { validate } from "../../utils/validate";
import {
  createVendorProductSchema,
  updateVendorProductSchema,
} from "./vendor-product.validator";
import * as controller from "./vendor-product.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Every route is the vendor's own catalogue; the account comes from the token.
router.use(requireAuth, requireRole("vendor"));

router.get("/", controller.listMyProducts);
router.post("/", validate(createVendorProductSchema), controller.createMyProduct);
router.get("/:id", controller.getMyProduct);
router.patch("/:id", validate(updateVendorProductSchema), controller.updateMyProduct);
router.delete("/:id", controller.archiveMyProduct);

export default router;
