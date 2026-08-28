import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";
import { createDb, type Db } from "../src/db/client.js";
import { migrateDb } from "../src/db/migrate.js";
import type { EmailMessage, Mailer } from "../src/lib/auth/mailer.js";

export class CaptureMailer implements Mailer {
  messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  config: AppConfig;
  mailer: CaptureMailer;
}

export async function createTestApp(): Promise<TestContext> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: ":memory:",
    JWT_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
    CORS_ORIGIN: "",
  });
  const db = createDb({ url: ":memory:" });
  migrateDb(db);
  const mailer = new CaptureMailer();
  const app = await buildApp({ config, db, mailer, logger: false });
  return { app, db, config, mailer };
}
