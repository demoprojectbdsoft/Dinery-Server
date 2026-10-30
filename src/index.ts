import app from "./app";
import { connectDB } from "./config/db";
import { ENV } from "./config/env";

import cron from "node-cron";
import { restoreDemoChanges } from "./modules/demo/demo.service";
import { expireStaleWarranties } from "./modules/warranty/warranty.service";
import { expireStaleDeliveries } from "./modules/delivery/delivery.service";

async function startServer() {
  await connectDB();

  const timezone = process.env.CRON_TIMEZONE || "Asia/Dhaka";

  // Schedule daily restore of demo admin changes at 12:00 AM (midnight local time)
  cron.schedule(
    "0 0 * * *",
    async () => {
      console.log("[CRON] 🕒 Running daily demo data restore at 12:00 AM...");
      try {
        const result = await restoreDemoChanges();
        console.log("[CRON] ✅ Demo data restored successfully:", result);
      } catch (err) {
        console.error("[CRON] ❌ Failed to restore demo data:", err);
      }
    },
    { timezone }
  );

  // Warranty expiry runs on its own schedule so a failing restore can never skip
  // it. The same sweep is exposed as GET /api/warranties/expire for Vercel Cron.
  cron.schedule(
    "30 0 * * *",
    async () => {
      try {
        const expired = await expireStaleWarranties();
        console.log("[CRON] ⏳ Stale warranties expired:", expired);
      } catch (err) {
        console.error("[CRON] ❌ Failed to expire warranties:", err);
      }
    },
    { timezone }
  );

  // Delivery requests that nobody answered: every ten minutes, because a rider
  // has a thirty-minute window. The accept endpoint refuses an expired offer on
  // its own, so this only keeps the board honest.
  cron.schedule(
    "*/10 * * * *",
    async () => {
      try {
        const result = await expireStaleDeliveries();
        if (result.expired > 0) {
          console.log("[CRON] ⏳ Expired delivery requests:", result.expired);
        }
      } catch (err) {
        console.error("[CRON] ❌ Failed to expire deliveries:", err);
      }
    },
    { timezone }
  );

  app.listen(ENV.PORT, () => {
    console.log(`Server running on port ${ENV.PORT}`);
    console.log(`[CRON] Daily demo restore scheduled for 12:00 AM, warranty expiry for 12:30 AM`);
  });
}

startServer();