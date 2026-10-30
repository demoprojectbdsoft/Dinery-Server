import { Router } from "express";
import { requireCronOrAdmin } from "../../middlewares/cron.middleware";
import * as demoController from "./demo.controller";

const router = Router();

router.get("/restore", requireCronOrAdmin, demoController.restoreDemoChanges); // Vercel Cron only makes GET requests
router.post("/restore", requireCronOrAdmin, demoController.restoreDemoChanges); // Convenient for API/manual calls

export default router;
