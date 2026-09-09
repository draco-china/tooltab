import type { HttpStatusCodeInfo } from "./status-code-types";
import { clientErrorStatusCodes } from "./status-codes/client-error-status-codes";
import { informationalStatusCodes } from "./status-codes/informational-status-codes";
import { redirectionStatusCodes } from "./status-codes/redirection-status-codes";
import { serverErrorStatusCodes } from "./status-codes/server-error-status-codes";
import { successStatusCodes } from "./status-codes/success-status-codes";

const statusCodes = [
  ...informationalStatusCodes,
  ...successStatusCodes,
  ...redirectionStatusCodes,
  ...clientErrorStatusCodes,
  ...serverErrorStatusCodes,
] satisfies readonly HttpStatusCodeInfo[];

export type {
  HttpStatusCodeCategory,
  HttpStatusCodeInfo,
} from "./status-code-types";
export { statusCodes };
