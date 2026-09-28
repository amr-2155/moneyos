import { z } from "zod";
import { transactionTypes } from "../../db/schema.js";
import { isValidDateStr } from "../../lib/dates.js";
const amount = z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a non-negative decimal string");
export const transactionCreateSchema = z.object({
    type: z.enum(["income", "expense"], {
        error: "Transaction type must be income or expense (use /transfers for transfers)",
    }),
    amount,
    accountId: z.string().min(1, "accountId is required"),
    categoryId: z.string().min(1, "categoryId is required"),
    date: z.string().refine(isValidDateStr, "Date must be a valid YYYY-MM-DD date"),
    description: z.string().trim().max(200, "Description is too long").optional(),
    notes: z.string().trim().max(1000, "Notes are too long").optional(),
});
export const transactionListQuerySchema = z.object({
    accountId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    type: z.enum(transactionTypes).optional(),
    from: z.string().refine(isValidDateStr, "from must be YYYY-MM-DD").optional(),
    to: z.string().refine(isValidDateStr, "to must be YYYY-MM-DD").optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(["date_desc", "date_asc"]).default("date_desc"),
});
export const transactionIdParamsSchema = z.object({
    id: z.string().min(1),
});
//# sourceMappingURL=transactions.schema.js.map