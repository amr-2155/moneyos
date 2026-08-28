import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import { categoryCreateSchema, categoryUpdateSchema } from "./categories.schema.js";
import type { CategoryService } from "./categories.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface CategoryRoutesDeps {
  service: CategoryService;
  authenticate: AuthenticateHandler;
}

export function registerCategoryRoutes(app: FastifyInstance, deps: CategoryRoutesDeps): void {
  const { service, authenticate } = deps;

  app.get("/categories", { preHandler: authenticate }, async (request) => {
    return service.list(request.user!.id);
  });

  app.post("/categories", { preHandler: authenticate }, async (request, reply) => {
    const body = parseOrThrow(categoryCreateSchema, request.body);
    const category = await service.create(request.user!.id, body);
    return reply.code(201).send(category);
  });

  app.patch("/categories/:id", { preHandler: authenticate }, async (request) => {
    const body = parseOrThrow(categoryUpdateSchema, request.body);
    return service.update(request.user!.id, (request.params as { id: string }).id, body);
  });

  app.post("/categories/:id/archive", { preHandler: authenticate }, async (request) => {
    return service.archive(request.user!.id, (request.params as { id: string }).id);
  });
}
