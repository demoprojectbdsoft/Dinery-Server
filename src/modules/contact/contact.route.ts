import { Router } from "express";
import * as contactController from "./contact.controller";

const router = Router();

// Public: visitors write to the shop without signing in.
router.post("/", contactController.sendMessage);

export default router;
