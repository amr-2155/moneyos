import { InvalidAmountError, parseAmountToMinor } from "./money.js";
import { AppError } from "./errors.js";
/**
 * Parses input with a Zod schema and converts failures into a
 * VALIDATION_ERROR AppError with a client-safe detail list.
 */
export function parseOrThrow(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success) {
        const details = result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
        }));
        throw AppError.badRequest("Invalid request payload", details);
    }
    return result.data;
}
/** Parses a decimal amount string to integer minor units, mapped to a 400. */
export function parseAmount(input, currency) {
    try {
        return parseAmountToMinor(input, currency);
    }
    catch (error) {
        if (error instanceof InvalidAmountError) {
            throw AppError.badRequest(error.message);
        }
        throw error;
    }
}
//# sourceMappingURL=zod.js.map