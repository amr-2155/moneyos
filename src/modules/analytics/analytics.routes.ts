import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { parseOrThrow } from "../../lib/zod.js";
import { analyticsQuerySchema, analyticsOverviewQuerySchema } from "./analytics.schema.js";
import type { AnalyticsService } from "./analytics.service.js";

type AuthenticateHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface AnalyticsRoutesDeps {
  service: AnalyticsService;
  authenticate: AuthenticateHandler;
}

export function registerAnalyticsRoutes(app: FastifyInstance, deps: AnalyticsRoutesDeps): void {
  const { service, authenticate } = deps;

  app.get(
    "/analytics/overview",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsOverviewQuerySchema, request.query);
      return service.overview(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/monthly-summary",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsQuerySchema, request.query);
      return service.monthlySummary(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/category-breakdown",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsQuerySchema, request.query);
      return service.categoryBreakdown(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/income-expense-trend",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsQuerySchema, request.query);
      return service.incomeExpenseTrend(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/period-comparison",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsQuerySchema, request.query);
      return service.periodComparison(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/net-worth-trend",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(analyticsQuerySchema, request.query);
      return service.netWorthTrend(request.user!.id, query);
    },
  );

  app.get(
    "/analytics/budget-performance",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(
        analyticsQuerySchema.extend({
          period: z.string().optional(),
          includeArchived: z
            .enum(["true", "false"])
            .transform((v) => v === "true")
            .default(false),
        }),
        request.query,
      );
      return service.budgetPerformance(request.user!.id, {
        period: query.period,
        includeArchived: query.includeArchived,
      });
    },
  );

  app.get(
    "/analytics/savings-goal-progress",
    { preHandler: authenticate },
    async (request) => {
      const query = parseOrThrow(
        analyticsQuerySchema.extend({
          includeArchived: z
            .enum(["true", "false"])
            .transform((v) => v === "true")
            .default(false),
        }),
        request.query,
      );
      return service.savingsGoalProgress(request.user!.id, {
        includeArchived: query.includeArchived,
      });
    },
  );
}
