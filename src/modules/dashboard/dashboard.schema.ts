import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../lib/currencies.js";
import { isValidMonthStr } from "../../lib/dates.js";

export const dashboardQuerySchema = z.object({
  month: z.string().refine(isValidMonthStr, "month must be YYYY-MM").optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
});
