import { parseOrThrow } from "../../lib/zod.js";
import { dashboardQuerySchema } from "./dashboard.schema.js";
export function registerDashboardRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.get("/dashboard", { preHandler: authenticate }, async (request) => {
        const query = parseOrThrow(dashboardQuerySchema, request.query);
        return service.getOverview(request.user.id, query);
    });
}
//# sourceMappingURL=dashboard.routes.js.map