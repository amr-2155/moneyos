import { parseOrThrow } from "../../lib/zod.js";
import { categoryCreateSchema, categoryUpdateSchema } from "./categories.schema.js";
export function registerCategoryRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.get("/categories", { preHandler: authenticate }, async (request) => {
        return service.list(request.user.id);
    });
    app.post("/categories", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(categoryCreateSchema, request.body);
        const category = await service.create(request.user.id, body);
        return reply.code(201).send(category);
    });
    app.patch("/categories/:id", { preHandler: authenticate }, async (request) => {
        const body = parseOrThrow(categoryUpdateSchema, request.body);
        return service.update(request.user.id, request.params.id, body);
    });
    app.post("/categories/:id/archive", { preHandler: authenticate }, async (request) => {
        return service.archive(request.user.id, request.params.id);
    });
}
//# sourceMappingURL=categories.routes.js.map