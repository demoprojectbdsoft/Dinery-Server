import { Router } from "express";
import { validate } from "../../utils/validate";
import {
  revokeRoleSchema,
  setActiveRoleSchema,
  updateUserSchema,
} from "./user.validator";
import * as userController from "./user.controller";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = Router();

/**
 * Route order matters: `/me/...` has to sit above `/:id`, otherwise Express
 * reads "me" as a user id.
 */

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/", requireAuth, requireRole("admin"), userController.getUsers);
router.delete("/:id", requireAuth, requireRole("admin"), userController.deleteUser);
router.patch(
  "/:id/roles/revoke",
  requireAuth,
  requireRole("admin"),
  validate(revokeRoleSchema),
  userController.revokeRole
);
router.post(
  "/:id/roles",
  requireAuth,
  requireRole("admin"),
  userController.setRoles
);

// ─── Self-service ─────────────────────────────────────────────────────────────
router.get("/me/export", requireAuth, userController.exportMyData);
router.get("/me/roles", requireAuth, userController.getMyRoles);
router.patch(
  "/me/active-role",
  requireAuth,
  validate(setActiveRoleSchema),
  userController.setActiveRole
);

router.get("/:id", requireAuth, userController.getUserById);
// Ownership + field rules are enforced in the controller: admins may edit
// anyone, a customer only their own profile and only non-privileged fields.
router.patch("/:id", requireAuth, validate(updateUserSchema), userController.updateUser);

export default router;
