import { z } from "zod";
import { parseOrThrow } from "../../lib/zod.js";
const syncOpSchema = z.object({
    operationId: z.string().uuid("operationId must be a UUID"),
    entity: z.enum(["account", "transaction", "transfer", "category", "budget", "savingsGoal", "savingsContribution"]),
    entityId: z.string().min(1, "entityId is required"),
    operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
    payload: z.record(z.string(), z.unknown()),
});
const syncBatchSchema = z.object({
    operations: z.array(syncOpSchema).min(1, "At least one operation is required"),
});
export function registerSyncRoutes(app, deps) {
    const { service, authenticate } = deps;
    app.post("/sync", { preHandler: authenticate }, async (request, reply) => {
        const body = parseOrThrow(syncBatchSchema, request.body);
        const results = await service.processBatch(request.user.id, body.operations);
        return reply.code(200).send(results);
    });
}
//# sourceMappingURL=sync.routes.js.map