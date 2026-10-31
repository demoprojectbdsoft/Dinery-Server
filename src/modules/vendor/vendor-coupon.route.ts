import { Router } from "express";
import { validate } from "../../utils/validate";
import {
  createCouponSchema,
  updateCouponSchema,
} from "../coupon/coupon.validator";
import * as controller from "./vendor-coupon.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Every route is the vendor's own codes; the account comes from the token.
router.use(requireAuth, requireRole("vendor"));

router.get("/", controller.listMyCoupons);
router.post("/", validate(createCouponSchema), controller.createMyCoupon);
router.get("/:id", controller.getMyCoupon);
router.patch("/:id", validate(updateCouponSchema), controller.updateMyCoupon);
router.delete("/:id", controller.deleteMyCoupon);

export default router;
