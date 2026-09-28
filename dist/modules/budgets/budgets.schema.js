import { z } from "zod";
import { isValidMonthStr } from "../../lib/dates.js";
const amount = z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a non-negative decimal string");
export const budgetCreateSchema = z.object({
    categoryId: z.string().min(1, "categoryId is required"),
    amount,
    currency: z.string().min(3).max(3).toUpperCase(),
    period: z.string().refine(isValidMonthStr, "period must be YYYY-MM"),
    warningThresholdPercent: z.coerce.number().int().min(1).max(100).default(80),
});
export const budgetUpdateSchema = z
    .object({
    categoryId: z.string().min(1, "categoryId is required").optional(),
    amount: amount.optional(),
    currency: z.string().min(3).max(3).toUpperCase().optional(),
    period: z.string().refine(isValidMonthStr, "period must be YYYY-MM").optional(),
    warningThresholdPercent: z.coerce.number().int().min(1).max(100).optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
});
export const budgetListQuerySchema = z.object({
    period: z.string().refine(isValidMonthStr, "period must be YYYY-MM").optional(),
    includeArchived: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .default(false),
});
export const budgetIdParamsSchema = z.object({
    id: z.string().min(1),
});
//# sourceMappingURL=budgets.schema.js.map