import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as productService from "./product.service";
import { getProductsQuerySchema } from "./product.validator";

export const createProduct = catchAsync(async (req, res) => {
  const product = await productService.createProduct(req.body);
  apiResponse(res, 201, product, "Product created");
});

export const getProducts = catchAsync(async (req, res) => {
  const query = parseQuery(getProductsQuerySchema, req.query);
  const result = await productService.getProducts(query);
  apiResponse(res, 200, result, "Products fetched successfully");
});

export const getProductBySlug = catchAsync(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug as string);
  apiResponse(res, 200, product, "Product fetched successfully");
});

export const updateProduct = catchAsync(async (req, res) => {
  const product = await productService.updateProduct(req.params.id as string, req.body);
  apiResponse(res, 200, product, "Product updated");
});

export const deleteProduct = catchAsync(async (req, res) => {
  await productService.deleteProduct(req.params.id as string);
  apiResponse(res, 200, null, "Product deleted");
});