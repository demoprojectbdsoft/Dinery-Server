import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as transactionService from "./transaction.service";
import { getTransactionsQuerySchema } from "./transaction.validator";

export const getTransactions = catchAsync(async (req, res) => {
  const query = parseQuery(getTransactionsQuerySchema, req.query);
  const result = await transactionService.getTransactions(query);
  apiResponse(res, 200, result, "Transactions fetched successfully");
});