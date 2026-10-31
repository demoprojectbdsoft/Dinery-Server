import { Router } from "express";
import * as activityController from "./activity.controller";
import { requireAuth } from "../../middlewares/auth.middleware";

const router = Router();

router.use(requireAuth);

// One feed for every role. "mine" is whatever the token's owner is allowed to
// read: the store team gets the shared board, everybody else gets the lines
// addressed to them. The user id is never taken from the request.
router.get("/mine", activityController.getMyFeed);
router.get("/mine/unread-count", activityController.getUnreadCount);
router.patch("/mine/read-all", activityController.markAllRead);
router.patch("/mine/:id/read", activityController.markRead);

export default router;
