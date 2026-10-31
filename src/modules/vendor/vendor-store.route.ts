import { Router } from "express";
import { validate } from "../../utils/validate";
import { updateStoreSchema } from "./vendor-store.validator";
import * as controller from "./vendor-store.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// ─── Public ─────────────────────────────────────────────────────────────────
// The discovery list and one shop's own page, served before the auth block,
// because a shopper looks at a store before deciding whether to sign in. Only
// trading shops answer, and the rows carry no seller contact details.
router.get("/public", controller.getPublicStores);
router.get("/public/:slug", controller.getPublicStore);

// The signed-in vendor's own shop, plus the store team's list. Every route
// either resolves the store from the token or asks for everyone's, so there is
// deliberately no "/:id" here for a seller to point at another shop.
router.get("/mine", requireAuth, requireRole("vendor"), controller.getMyStore);
router.patch(
  "/mine",
  requireAuth,
  requireRole("vendor"),
  validate(updateStoreSchema),
  controller.updateMyStore
);

// ─── Store team ───────────────────────────────────────────────────────────────
// Everyone's shops on one page. This is the read a desk uses when it has to
// choose a seller — a storefront placement is granted to an account, so the
// list hands out the `userId` a grant expects rather than the shop's own id.
router.get("/", requireAuth, requireRole("admin"), controller.getStores);

export default router;
