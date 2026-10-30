import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { parseQuery } from "../../utils/validate";
import * as messageService from "./message.service";
import { getMessagesQuerySchema } from "./message.validator";

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
