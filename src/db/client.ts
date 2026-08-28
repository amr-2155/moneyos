import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema> & { $client: DatabaseType };

export interface CreateDbOptions {
  url: string;
}

/**
 * Creates a better-sqlite3 + drizzle client.
 * Foreign keys are enforced per connection; the parent directory of file-based
 * databases is created when missing.
 */
export function createDb({ url }: CreateDbOptions): Db {
  if (!url.startsWith(":memory:") && !url.startsWith("file:")) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  return drizzle(sqlite, { schema });
}
