import { z } from "zod";

/**
 * An admin's edit to one plan.
 *
 * Every field is optional, so the settings screen can send only what changed.
 * The enum mirrors the plan table: a value outside it is a 400, never a stored
 * typo the dashboards would then have to guess about.
 */
export const updatePlanSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  monthlyPrice: z.coerce.number().min(0).optional(),
  yearlyPrice: z.coerce.number().min(0).optional(),
  maxProducts: z.coerce.number().int().min(0).optional(),
  featuredProducts: z.coerce.number().int().min(0).optional(),
  featuredDurationDays: z.coerce.number().int().min(0).optional(),
  activeCoupons: z.coerce.number().int().min(0).optional(),
  analytics: z.enum(["basic", "detailed", "advanced"]).optional(),
  salesReports: z.enum(["basic", "advanced"]).optional(),
  exports: z.enum(["limited", "full"]).optional(),
  storeCustomization: z.enum(["basic", "enhanced", "full"]).optional(),
  promotionalCampaigns: z.enum(["none", "limited", "priority"]).optional(),
  storeVisibility: z.enum(["standard", "enhanced", "priority"]).optional(),
  support: z.enum(["standard", "priority"]).optional(),
  highlights: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  isActive: z.boolean().optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  gracePeriodDays: z.coerce.number().int().min(0).max(90).optional(),
  billingCycles: z.array(z.enum(["monthly", "yearly"])).min(1).optional(),
});

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
