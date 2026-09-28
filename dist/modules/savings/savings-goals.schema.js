import { z } from "zod";
import { isValidDateStr } from "../../lib/dates.js";
const amount = z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a non-negative decimal string");
export const savingsGoalCreateSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    targetAmount: amount,
    currency: z.string().min(3).max(3).toUpperCase(),
    targetDate: z.string().refine(isValidDateStr, "targetDate must be YYYY-MM-DD").nullish(),
    description: z.string().trim().max(1000, "Description is too long").optional(),
    /** Optional starting balance; also recorded as the first contribution. */
    currentAmount: amount.optional(),
});
export const savingsGoalUpdateSchema = z
    .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
    targetAmount: amount.optional(),
    currency: z.string().min(3).max(3).toUpperCase().optional(),
    targetDate: z
        .string()
        .refine(isValidDateStr, "targetDate must be YYYY-MM-DD")
        .nullable()
        .optional(),
    description: z.string().trim().max(1000, "Description is too long").nullable().optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
});
export const savingsGoalListQuerySchema = z.object({
    includeArchived: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .default(false),
});
export const savingsContributionCreateSchema = z.object({
    amount,
    note: z.string().trim().max(500, "Note is too long").optional(),
});
export const savingsGoalIdParamsSchema = z.object({
    id: z.string().min(1),
});
//# sourceMappingURL=savings-goals.schema.js.map