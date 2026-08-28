import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDb, type Db } from "./client.js";
import { seedDefaults } from "./seed.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function resolveDatabaseUrl(url: string): string {
  return url.startsWith("file:") || url.startsWith(":memory:")
    ? url
    : resolve(projectRoot, url);
}

/** Applies the generated SQL migrations to the given connection. */
export function migrateDb(db: Db): void {
  migrate(db, { migrationsFolder: resolve(projectRoot, "drizzle") });
  seedDefaults(db);
}

export function runMigrations(url: string): void {
  const db = createDb({ url: resolveDatabaseUrl(url) });
  migrateDb(db);
  db.$client.close();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL ?? "./data/moneyos.db";
  runMigrations(url);
  console.log(`[moneyos] migrations applied to ${url}`);
}
