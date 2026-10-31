import { Router } from "express";
import { validate } from "../../utils/validate";
import { featureProductSchema } from "./featured-promotion.validator";
import * as controller from "./vendor-promotion.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Every route is the seller's own placements; the account comes from the token.
router.use(requireAuth, requireRole("vendor"));

router.get("/", controller.listMyPromotions);
router.post("/", validate(featureProductSchema), controller.featureMyProduct);
router.delete("/:id", controller.cancelMyPromotion);

export default router;
