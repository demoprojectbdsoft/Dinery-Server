import { Router } from "express";
import * as messageController from "./message.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

// Contact messages are private correspondence, so the whole router is admin-only.
router.use(requireAuth, requireRole("admin"));

router.get("/", messageController.getMessages);
router.post("/:id/reply", messageController.replyToMessage);
router.delete("/:id", messageController.deleteMessage);

export default router;
