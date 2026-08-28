import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import { dashboardQuerySchema } from "./dashboard.schema.js";
import type { DashboardService } from "./dashboard.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface DashboardRoutesDeps {
  service: DashboardService;
  authenticate: AuthenticateHandler;
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { service, authenticate } = deps;

  app.get("/dashboard", { preHandler: authenticate }, async (request) => {
    const query = parseOrThrow(dashboardQuerySchema, request.query);
    return service.getOverview(request.user!.id, query);
  });
}
