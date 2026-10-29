import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as reviewService from "./review.service";
import { getReviewsQuerySchema } from "./review.validator";

export const createReview = catchAsync(async (req, res) => {
  const review = await reviewService.createReview(req.body);
  apiResponse(res, 201, review, "Review added");
});

export const getReviews = catchAsync(async (req, res) => {
  const query = parseQuery(getReviewsQuerySchema, req.query);
  const result = await reviewService.getReviews(query);
  apiResponse(res, 200, result, "Reviews fetched successfully");
});

export const updateReview = catchAsync(async (req, res) => {
  const review = await reviewService.updateReview(
    req.params.id as string,
    req.body,
    req.user?.id,
    req.user?.role
  );
  apiResponse(res, 200, review, "Review updated");
});

export const deleteReview = catchAsync(async (req, res) => {
  await reviewService.deleteReview(req.params.id as string);
  apiResponse(res, 200, null, "Review deleted");
});