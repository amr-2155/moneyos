/**
 * Domain error mapped to the API error envelope. Intentionally does not expose
 * stack traces or internal details to clients.
 */
export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
    static badRequest(message, details) {
        return new AppError(400, "VALIDATION_ERROR", message, details);
    }
    static unauthorized(message = "Authentication required") {
        return new AppError(401, "UNAUTHORIZED", message);
    }
    static forbidden(message = "You do not have permission to perform this action") {
        return new AppError(403, "FORBIDDEN", message);
    }
    static notFound(message = "Resource not found") {
        return new AppError(404, "NOT_FOUND", message);
    }
    static conflict(message) {
        return new AppError(409, "CONFLICT", message);
    }
    static rateLimited(message = "Too many requests") {
        return new AppError(429, "RATE_LIMITED", message);
    }
}
export function registerErrorHandler(app) {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof AppError) {
            void reply.status(error.statusCode).send({
                error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
            });
            return;
        }
        const validation = isFastifyValidationError(error) ? error.validation : undefined;
        if (validation && validation.length > 0) {
            void reply.status(400).send({
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid request payload",
                    details: validation,
                },
            });
            return;
        }
        request.log.error({ err: error, reqId: request.id }, "Unhandled error");
        void reply.status(500).send({
            error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
        });
    });
}
function isFastifyValidationError(error) {
    return (typeof error === "object" &&
        error !== null &&
        "validation" in error &&
        Array.isArray(error.validation));
}
//# sourceMappingURL=errors.js.map