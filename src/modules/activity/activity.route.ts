import { Router } from "express";
import * as activityController from "./activity.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

router.use(requireAuth);

// The store feed names orders, payments and people, so it is for the store team
// only. Personal lines are filtered out of it — they belong to their owner.
router.get("/", requireRole("admin"), activityController.getActivities);

// Everything under "mine" is the caller's own feed: the user id comes from the
// token, never from the request.
router.get("/mine", activityController.getMyNotifications);
router.get("/mine/unread-count", activityController.getUnreadCount);
router.patch("/mine/read-all", activityController.markAllRead);
router.patch("/mine/:id/read", activityController.markRead);

export default router;
