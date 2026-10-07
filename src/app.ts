import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
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
import { registerSyncRoutes } from "./modules/sync/sync.routes.js";
import { SyncService } from "./modules/sync/sync.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../web/dist");

// MIME types for common files
const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".apk": "application/vnd.android.package-archive",
  ".txt": "text/plain",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

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
  const syncService = new SyncService(db, accounts, categories, budgets, savingsGoals);

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
      registerSyncRoutes(api, { service: syncService, authenticate });
    },
    { prefix: "/api" },
  );

  // Helper to serve static files from web/dist.
  // Defence-in-depth: resolves the request against distPath and refuses to
  // serve anything that escapes it (traversal, absolute paths, Windows
  // drive-relative paths), even though the router already normalises `..`.
  async function serveFile(request: FastifyRequest, reply: FastifyReply, filePath: string) {
    const relative = filePath.replace(/^[/\\]+/, "");
    const resolved = path.resolve(distPath, relative);
    const insideDist = resolved === distPath || resolved.startsWith(distPath + path.sep);
    if (!insideDist || relative.includes("\0")) {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "File not found" } });
      return;
    }
    try {
      const content = await fs.promises.readFile(resolved);
      reply.type(getContentType(resolved)).send(content);
    } catch {
      reply.code(404).send({ error: { code: "NOT_FOUND", message: "File not found" } });
    }
  }

  // Root - landing page
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "index.html");
  });

  // SPA fallback for /app/* routes
  app.get("/app", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "app.html");
  });
  // Alias so the static landing page's relative `app.html` link also works
  // when it is served by this server (GitHub Pages serves it as a real file).
  app.get("/app.html", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "app.html");
  });
  app.get("/app/*", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "app.html");
  });

  // Static files
  app.get("/favicon.ico", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "favicon.ico");
  });
  app.get("/favicon.svg", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "favicon.svg");
  });
  app.get("/favicon-16.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "favicon-16.png");
  });
  app.get("/favicon-32.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "favicon-32.png");
  });
  app.get("/apple-touch-icon.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "apple-touch-icon.png");
  });
  app.get("/maskable-512.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "maskable-512.png");
  });
  app.get("/icon-192.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "icon-192.png");
  });
  app.get("/icon-512.png", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "icon-512.png");
  });
  app.get("/manifest.json", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "manifest.json");
  });
  app.get("/sw.js", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "sw.js");
  });
  app.get("/assets/*", async (request: FastifyRequest, reply: FastifyReply) => {
      return serveFile(request, reply, request.url.slice(1));
    });

  // Success page for post-submission redirects - auto-redirect to app
  app.get("/success", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "success.html");
  });
  app.post("/success", async (request: FastifyRequest, reply: FastifyReply) => {
    return serveFile(request, reply, "success.html");
  });

  // SPA fallback: deep links into the app (e.g. /reports after refresh)
  // land on app.html; unknown API/file paths stay 404.
  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (url.startsWith("/api/")) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
    }
    if (url.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url)) {
      return reply.code(404).send({ error: "File not found" });
    }
    return serveFile(request, reply, "app.html");
  });

  return app;
}