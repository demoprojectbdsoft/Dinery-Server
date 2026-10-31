import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";
import { requireCronOrAdmin } from "../../middlewares/cron.middleware";
import { validate } from "../../utils/validate";
import * as controller from "./vendor-subscription.controller";
import { checkoutSubscriptionSchema } from "./vendor-subscription.validator";

const router = Router();

/**
 * Scheduled: close periods that ran out while nobody was reading them. Above
 * the vendor block, because Vercel Cron carries no user token.
 */
router.get("/expire", requireCronOrAdmin, controller.expireSubscriptions);

router.use(requireAuth, requireRole("vendor"));

router.get("/mine", controller.getMySubscription);
router.post("/checkout", validate(checkoutSubscriptionSchema), controller.checkout);
router.post("/cancel-renewal", controller.cancelSubscriptionRenewal);

export default router;
