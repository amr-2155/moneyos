import { z } from "zod";
import { accountTypes } from "../../db/schema.js";
import { SUPPORTED_CURRENCIES } from "../../lib/currencies.js";
export const accountCreateSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    type: z.enum(accountTypes),
    currency: z.enum(SUPPORTED_CURRENCIES).default("EGP"),
    openingBalance: z
        .string()
        .regex(/^\d+(\.\d+)?$/, "Opening balance must be a non-negative decimal string")
        .default("0"),
    note: z.string().trim().max(500, "Note is too long").optional(),
});
export const accountUpdateSchema = z
    .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
    type: z.enum(accountTypes).optional(),
    note: z.string().trim().max(500, "Note is too long").nullable().optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
});
//# sourceMappingURL=accounts.schema.js.map