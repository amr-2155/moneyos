import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import {
  savingsContributionCreateSchema,
  savingsGoalCreateSchema,
  savingsGoalIdParamsSchema,
  savingsGoalListQuerySchema,
  savingsGoalUpdateSchema,
} from "./savings-goals.schema.js";
import type { SavingsGoalService } from "./savings-goals.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface SavingsRoutesDeps {
  service: SavingsGoalService;
  authenticate: AuthenticateHandler;
}

export function registerSavingsRoutes(app: FastifyInstance, deps: SavingsRoutesDeps): void {
  const { service, authenticate } = deps;

  app.get("/savings-goals", { preHandler: authenticate }, async (request) => {
    const query = parseOrThrow(savingsGoalListQuerySchema, request.query);
    return service.list(request.user!.id, query);
  });

  app.post("/savings-goals", { preHandler: authenticate }, async (request, reply) => {
    const body = parseOrThrow(savingsGoalCreateSchema, request.body);
    const goal = await service.create(request.user!.id, body);
    return reply.code(201).send(goal);
  });

  app.get("/savings-goals/:id", { preHandler: authenticate }, async (request) => {
    const { id } = parseOrThrow(savingsGoalIdParamsSchema, request.params);
    return service.get(request.user!.id, id);
  });

  app.patch("/savings-goals/:id", { preHandler: authenticate }, async (request) => {
    const { id } = parseOrThrow(savingsGoalIdParamsSchema, request.params);
    const body = parseOrThrow(savingsGoalUpdateSchema, request.body);
    return service.update(request.user!.id, id, body);
  });

  app.post("/savings-goals/:id/archive", { preHandler: authenticate }, async (request) => {
    const { id } = parseOrThrow(savingsGoalIdParamsSchema, request.params);
    return service.archive(request.user!.id, id);
  });

  app.post(
    "/savings-goals/:id/contributions",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = parseOrThrow(savingsGoalIdParamsSchema, request.params);
      const body = parseOrThrow(savingsContributionCreateSchema, request.body);
      const goal = await service.addContribution(request.user!.id, id, body);
      return reply.code(201).send(goal);
    },
  );

  app.get(
    "/savings-goals/:id/contributions",
    { preHandler: authenticate },
    async (request) => {
      const { id } = parseOrThrow(savingsGoalIdParamsSchema, request.params);
      return service.listContributions(request.user!.id, id);
    },
  );
}
