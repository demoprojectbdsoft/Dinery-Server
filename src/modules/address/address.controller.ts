import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { currentUserId } from "../../utils/authz";
import * as addressService from "./address.service";

/**
 * Saved shipping addresses always belong to whoever is signed in — the id comes
 * from the bearer token, never from the body, so one customer can never read or
 * change another customer's address book.
 */

export const getAddresses = catchAsync(async (req, res) => {
  const addresses = await addressService.getAddresses(currentUserId(req.user));
  apiResponse(res, 200, addresses, "Addresses fetched successfully");
});

export const saveAddress = catchAsync(async (req, res) => {
  const result = await addressService.saveAddress(currentUserId(req.user), req.body);
  apiResponse(
    res,
    result.created ? 201 : 200,
    result.address,
    result.created ? "Address saved" : "This address is already saved"
  );
});

export const updateAddress = catchAsync(async (req, res) => {
  const address = await addressService.updateAddress(
    currentUserId(req.user),
    req.params.id as string,
    req.body
  );
  apiResponse(res, 200, address, "Address updated");
});

export const removeAddress = catchAsync(async (req, res) => {
  await addressService.removeAddress(currentUserId(req.user), req.params.id as string);
  apiResponse(res, 200, null, "Address removed");
});

export const setDefaultAddress = catchAsync(async (req, res) => {
  const address = await addressService.setDefaultAddress(
    currentUserId(req.user),
    req.params.id as string
  );
  apiResponse(res, 200, address, "Default address updated");
});
