import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../../lib/currencies.js";
import { isValidMonthStr } from "../../lib/dates.js";

/**
 * Valid date-range query parameters.
 * - `from`/`to` are YYYY-MM strings (inclusive month range)
 * - `currency` is restricted to supported currencies
 * - `limit` caps the number of category results for top-N queries
 * - `month` pins a single month; `months` caps the range window
 */
export const analyticsQuerySchema = z.object({
  from: z.string().refine(isValidMonthStr, "from must be YYYY-MM").optional(),
  to: z.string().refine(isValidMonthStr, "to must be YYYY-MM").optional(),
  month: z.string().refine(isValidMonthStr, "month must be YYYY-MM").optional(),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
  months: z.coerce.number().int().min(1).max(24).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const analyticsOverviewQuerySchema = analyticsQuerySchema.omit({
  limit: true,
  months: true,
});

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsOverviewQueryInput = z.infer<typeof analyticsOverviewQuerySchema>;
