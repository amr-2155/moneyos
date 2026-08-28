import { loadConfig } from "./config/env.js";
import { buildApp } from "./app.js";
import { createDb } from "./db/client.js";
import { resolveDatabaseUrl, runMigrations } from "./db/migrate.js";

async function main(): Promise<void> {
  const config = loadConfig();
  runMigrations(config.databaseUrl);

  const db = createDb({ url: resolveDatabaseUrl(config.databaseUrl) });
  const app = await buildApp({ config, db, logger: true });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    db.$client.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
  console.error("[moneyos] failed to start:", error);
  process.exit(1);
});
