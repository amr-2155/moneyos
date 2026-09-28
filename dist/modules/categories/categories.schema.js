import { z } from "zod";
import { categoryTypes } from "../../db/schema.js";
export const categoryCreateSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
    type: z.enum(categoryTypes).default("expense"),
    parentId: z.string().min(1).optional(),
    icon: z.string().trim().max(50, "Icon is too long").optional(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #ff5500")
        .optional(),
});
export const categoryUpdateSchema = z
    .object({
    name: z.string().trim().min(1, "Name is required").max(100, "Name is too long").optional(),
    icon: z.string().trim().max(50, "Icon is too long").nullable().optional(),
    color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #ff5500")
        .nullable()
        .optional(),
    parentId: z.string().min(1).nullable().optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
});
//# sourceMappingURL=categories.schema.js.map