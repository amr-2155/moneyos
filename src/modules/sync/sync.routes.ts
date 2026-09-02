import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import type { SyncService } from "./sync.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface SyncRoutesDeps {
  service: SyncService;
  authenticate: AuthenticateHandler;
}

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

export function registerSyncRoutes(app: FastifyInstance, deps: SyncRoutesDeps): void {
  const { service, authenticate } = deps;

  app.post(
    "/sync",
    { preHandler: authenticate },
    async (request, reply) => {
      const body = parseOrThrow(syncBatchSchema, request.body);
      const results = await service.processBatch(request.user!.id, body.operations);
      return reply.code(200).send(results);
    },
  );
}
