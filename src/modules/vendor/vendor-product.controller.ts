import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import { vendorProductQuerySchema } from "./vendor-product.validator";
import * as productService from "./vendor-product.service";

/**
 * The vendor's catalogue, always scoped to the signed-in account.
 *
 * No route accepts a vendor id: the token supplies it, so a vendor cannot list,
 * edit or archive another seller's products by changing a URL.
 */

export const listMyProducts = catchAsync(async (req, res) => {
  const query = parseQuery(vendorProductQuerySchema, req.query);
  const result = await productService.listMyProducts(req.user!.id, query);
  apiResponse(res, 200, result, "Products fetched successfully");
});

export const getMyProduct = catchAsync(async (req, res) => {
  const product = await productService.getMyProduct(req.user!.id, req.params.id as string);
  apiResponse(res, 200, product, "Product fetched successfully");
});

export const createMyProduct = catchAsync(async (req, res) => {
  const product = await productService.createMyProduct(req.user!.id, req.body);
  apiResponse(res, 201, product, "Product saved");
});

export const updateMyProduct = catchAsync(async (req, res) => {
  const product = await productService.updateMyProduct(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  apiResponse(res, 200, product, "Product updated");
});

export const archiveMyProduct = catchAsync(async (req, res) => {
  const product = await productService.archiveMyProduct(req.user!.id, req.params.id as string);
  apiResponse(res, 200, product, "Product archived");
});
