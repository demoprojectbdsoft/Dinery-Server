import { Router } from "express";
import { validate } from "../../utils/validate";
import { saveAddressSchema, updateAddressSchema } from "./address.validator";
import * as addressController from "./address.controller";
import { requireAuth } from "../../middlewares/auth.middleware";

const router = Router();

// Every address endpoint is personal: without a token there is nothing to show.
router.use(requireAuth);

router.get("/", addressController.getAddresses);
router.post("/", validate(saveAddressSchema), addressController.saveAddress);
// "/:id/default" is registered before "/:id" so "default" is never read as an id.
router.patch("/:id/default", addressController.setDefaultAddress);
router.patch("/:id", validate(updateAddressSchema), addressController.updateAddress);
router.delete("/:id", addressController.removeAddress);

export default router;
