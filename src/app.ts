import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "./config/env.js";
import type { Db } from "./db/client.js";
import { createAuthenticate } from "./lib/auth/authenticate.js";
import { ConsoleMailer, type Mailer } from "./lib/auth/mailer.js";
import { registerErrorHandler } from "./lib/errors.js";
import { AccountService } from "./modules/accounts/accounts.service.js";
import { registerAccountRoutes } from "./modules/accounts/accounts.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerBudgetRoutes } from "./modules/budgets/budgets.routes.js";
import { BudgetService } from "./modules/budgets/budgets.service.js";
import { registerAnalyticsRoutes } from "./modules/analytics/analytics.routes.js";
import { AnalyticsService } from "./modules/analytics/analytics.service.js";
import { CategoryService } from "./modules/categories/categories.service.js";
import { registerCategoryRoutes } from "./modules/categories/categories.routes.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { registerDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerSavingsRoutes } from "./modules/savings/savings-goals.routes.js";
import { SavingsGoalService } from "./modules/savings/savings-goals.service.js";
import { registerTransactionRoutes } from "./modules/transactions/transactions.routes.js";
import { TransactionService } from "./modules/transactions/transactions.service.js";
import { registerTransferRoutes } from "./modules/transfers/transfers.routes.js";
import { TransferService } from "./modules/transfers/transfers.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  logger?: boolean;
  mailer?: Mailer;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db, logger = false } = options;
  const app = Fastify({ logger });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
    }),
  });

  const distPath = path.resolve(__dirname, "../web/dist");
  await app.register(import("@fastify/static"), {
    root: distPath,
    prefix: "/",
    decorateReply: false,
  });

  registerErrorHandler(app);

  const mailer = options.mailer ?? new ConsoleMailer();
  const authService = new AuthService(db, config, mailer);
  const authenticate = createAuthenticate(config);

  const accounts = new AccountService(db);
  const categories = new CategoryService(db);
  const transactions = new TransactionService(db, accounts, categories);
  const transfers = new TransferService(db, accounts);
  const budgets = new BudgetService(db, categories);
  const savingsGoals = new SavingsGoalService(db);
  const dashboard = new DashboardService(db, accounts, transactions);
  const analytics = new AnalyticsService(db);

  registerHealthRoutes(app, { db, appName: config.appName });
  await app.register(
    async (api) => {
      registerAuthRoutes(api, { service: authService, authenticate });
      registerAccountRoutes(api, { service: accounts, authenticate });
      registerCategoryRoutes(api, { service: categories, authenticate });
      registerTransactionRoutes(api, { service: transactions, authenticate });
      registerTransferRoutes(api, { service: transfers, authenticate });
      registerBudgetRoutes(api, { service: budgets, authenticate });
      registerSavingsRoutes(api, { service: savingsGoals, authenticate });
      registerDashboardRoutes(api, { service: dashboard, authenticate });
      registerAnalyticsRoutes(api, { service: analytics, authenticate });
    },
    { prefix: "/api" },
  );

  return app;
}
