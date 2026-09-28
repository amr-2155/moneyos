import { parseOrThrow } from "../../lib/zod.js";
import { accountCreateSchema, accountUpdateSchema } from "./accounts.schema.js";
export function registerAccountRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.get("/accounts", { preHandler: authenticate }, async (request) => {
        return service.list(request.user.id);
    });
    app.post("/accounts", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(accountCreateSchema, request.body);
        const account = await service.create(request.user.id, body);
        return reply.code(201).send(account);
    });
    app.get("/accounts/:id", { preHandler: authenticate }, async (request) => {
        return service.get(request.user.id, request.params.id);
    });
    app.patch("/accounts/:id", { preHandler: authenticate }, async (request) => {
        const body = parseOrThrow(accountUpdateSchema, request.body);
        return service.update(request.user.id, request.params.id, body);
    });
    app.post("/accounts/:id/archive", { preHandler: authenticate }, async (request) => {
        return service.setActive(request.user.id, request.params.id, false);
    });
    app.post("/accounts/:id/activate", { preHandler: authenticate }, async (request) => {
        return service.setActive(request.user.id, request.params.id, true);
    });
}
//# sourceMappingURL=accounts.routes.js.map