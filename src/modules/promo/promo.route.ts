import { Router } from "express";
import { validate } from "../../utils/validate";
import { createPromoSchema, updatePromoSchema } from "./promo.validator";
import * as promoController from "./promo.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// The storefront reads banners without a token; only an admin may change them.
router.get("/", promoController.getPromos);
router.post("/", requireAuth, requireRole("admin"), validate(createPromoSchema), promoController.createPromo);
router.patch("/:id", requireAuth, requireRole("admin"), validate(updatePromoSchema), promoController.updatePromo);
router.delete("/:id", requireAuth, requireRole("admin"), promoController.deletePromo);

export default router;
