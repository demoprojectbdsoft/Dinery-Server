import { catchAsync } from "../../utils/catchAsync";
import { apiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import * as mailService from "./mail.service";
import { resetPasswordMailSchema } from "./mail.validator";

/** Emails the storefront asks for. Reachable only with the internal key. */

export const sendPasswordReset = catchAsync(async (req, res, next) => {
  const parsed = resetPasswordMailSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ApiError(400, parsed.error.issues[0].message));
  }

  await mailService.sendPasswordResetMail(parsed.data);
  apiResponse(res, 200, null, "Reset email sent");
});
