import { parseOrThrow } from "../../lib/zod.js";
import { transferCreateSchema, transferIdParamsSchema, transferListQuerySchema, } from "./transfers.schema.js";
export function registerTransferRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.post("/transfers", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(transferCreateSchema, request.body);
        const transfer = await service.create(request.user.id, body);
        return reply.code(201).send(transfer);
    });
    app.get("/transfers", { preHandler: authenticate }, async (request) => {
        const query = parseOrThrow(transferListQuerySchema, request.query);
        return service.list(request.user.id, query);
    });
    app.post("/transfers/:id/reverse", { preHandler: authenticate }, async (request, reply) => {
        const { id } = parseOrThrow(transferIdParamsSchema, request.params);
        const reversal = await service.reverse(request.user.id, id);
        return reply.code(201).send(reversal);
    });
}
//# sourceMappingURL=transfers.routes.js.map