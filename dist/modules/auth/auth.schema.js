import { z } from "zod";
const email = z.string().trim().toLowerCase().email("A valid email is required");
const password = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be at most 200 characters");
const name = z.string().trim().min(1, "Name is required").max(100, "Name is too long");
export const signupSchema = z.object({
    email,
    password,
    name,
});
export const loginSchema = z.object({
    email,
    password: z.string().min(1, "Password is required").max(200),
});
export const refreshSchema = z.object({
    refreshToken: z.string().min(20, "refreshToken is required"),
});
export const logoutSchema = z.object({
    refreshToken: z.string().min(20, "refreshToken is required"),
});
export const forgotPasswordSchema = z.object({
    email,
});
export const resetPasswordSchema = z.object({
    token: z.string().min(20, "token is required"),
    password,
});
export const updateMeSchema = z
    .object({
    name: name.optional(),
    defaultCurrency: z
        .string()
        .trim()
        .toUpperCase()
        .length(3, "Currency must be a 3-letter ISO 4217 code")
        .optional(),
    locale: z
        .string()
        .trim()
        .min(2, "Locale is too short")
        .max(10, "Locale is too long")
        .optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
});
//# sourceMappingURL=auth.schema.js.map