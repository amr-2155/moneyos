import { parseOrThrow } from "../../lib/zod.js";
import { transactionCreateSchema, transactionIdParamsSchema, transactionListQuerySchema, } from "./transactions.schema.js";
export function registerTransactionRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.post("/transactions", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(transactionCreateSchema, request.body);
        const transaction = await service.create(request.user.id, body);
        return reply.code(201).send(transaction);
    });
    app.get("/transactions", { preHandler: authenticate }, async (request) => {
        const query = parseOrThrow(transactionListQuerySchema, request.query);
        return service.list(request.user.id, query);
    });
    app.get("/transactions/:id", { preHandler: authenticate }, async (request) => {
        const { id } = parseOrThrow(transactionIdParamsSchema, request.params);
        return service.get(request.user.id, id);
    });
    app.post("/transactions/:id/reverse", { preHandler: authenticate }, async (request, reply) => {
        const { id } = parseOrThrow(transactionIdParamsSchema, request.params);
        const reversal = await service.reverse(request.user.id, id);
        return reply.code(201).send(reversal);
    });
}
//# sourceMappingURL=transactions.routes.js.map