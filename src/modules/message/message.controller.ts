import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { parseQuery } from "../../utils/validate";
import * as messageService from "./message.service";
import { getMessagesQuerySchema, replyMessageSchema } from "./message.validator";

/** The admin inbox for the contact page. Creating happens inside the contact flow. */

export const getMessages = catchAsync(async (req, res) => {
  const query = parseQuery(getMessagesQuerySchema, req.query);
  const result = await messageService.getMessages(query);
  apiResponse(res, 200, result, "Messages fetched successfully");
});

export const deleteMessage = catchAsync(async (req, res) => {
  await messageService.deleteMessage(req.params.id as string);
  apiResponse(res, 200, null, "Message deleted");
});

/** Admin answers a visitor. The address is read from the stored message. */
export const replyToMessage = catchAsync(async (req, res, next) => {
  const parsed = replyMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }

  const result = await messageService.replyToMessage(
    req.params.id as string,
    parsed.data
  );
  apiResponse(res, 200, result, `Reply sent to ${result.to}`);
});
