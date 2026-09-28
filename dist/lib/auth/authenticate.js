import { AppError } from "../errors.js";
import { verifyAccessToken } from "./tokens.js";
export function createAuthenticate(config) {
    return async function authenticate(request, reply) {
        void reply;
        const header = request.headers.authorization;
        const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
        if (!token) {
            throw AppError.unauthorized();
        }
        const userId = await verifyAccessToken(config, token);
        if (!userId) {
            throw AppError.unauthorized("Invalid or expired token");
        }
        request.user = { id: userId };
    };
}
//# sourceMappingURL=authenticate.js.map