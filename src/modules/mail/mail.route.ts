import { Router } from "express";
import * as mailController from "./mail.controller";
import { requireInternalKey } from "../../middlewares/internal.middleware";

const router = Router();

// Called by the Next.js app when a customer asks to reset their password.
// The internal key keeps the routes closed to everyone else.
router.post("/reset-password", requireInternalKey, mailController.sendPasswordReset);

export default router;
