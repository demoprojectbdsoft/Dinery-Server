import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { contactMessageSchema } from "./contact.validator";
import * as contactService from "./contact.service";

/**
 * Public: a visitor sends a message from the contact page.
 * There is no auth check on purpose — shoppers can write before they register.
 */
export const sendMessage = catchAsync(async (req, res, next) => {
  const parsed = contactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }

  await contactService.sendContactMessage(parsed.data);
  apiResponse(res, 201, { delivered: true }, "Thanks! Your message is on its way.");
});
