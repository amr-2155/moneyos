import { parseOrThrow } from "../../lib/zod.js";
import { budgetCreateSchema, budgetIdParamsSchema, budgetListQuerySchema, budgetUpdateSchema, } from "./budgets.schema.js";
export function registerBudgetRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.get("/budgets", { preHandler: authenticate }, async (request) => {
        const query = parseOrThrow(budgetListQuerySchema, request.query);
        return service.list(request.user.id, query);
    });
    app.post("/budgets", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(budgetCreateSchema, request.body);
        const budget = await service.create(request.user.id, body);
        return reply.code(201).send(budget);
    });
    app.get("/budgets/:id", { preHandler: authenticate }, async (request) => {
        const { id } = parseOrThrow(budgetIdParamsSchema, request.params);
        return service.get(request.user.id, id);
    });
    app.patch("/budgets/:id", { preHandler: authenticate }, async (request) => {
        const { id } = parseOrThrow(budgetIdParamsSchema, request.params);
        const body = parseOrThrow(budgetUpdateSchema, request.body);
        return service.update(request.user.id, id, body);
    });
    app.post("/budgets/:id/archive", { preHandler: authenticate }, async (request) => {
        const { id } = parseOrThrow(budgetIdParamsSchema, request.params);
        return service.archive(request.user.id, id);
    });
}
//# sourceMappingURL=budgets.routes.js.map