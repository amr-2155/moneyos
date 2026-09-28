import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database, {} from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
/**
 * Creates a better-sqlite3 + drizzle client.
 * Foreign keys are enforced per connection; the parent directory of file-based
 * databases is created when missing.
 */
export function createDb({ url }) {
    if (!url.startsWith(":memory:") && !url.startsWith("file:")) {
        mkdirSync(dirname(url), { recursive: true });
    }
    const sqlite = new Database(url);
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("journal_mode = WAL");
    return drizzle(sqlite, { schema });
}
//# sourceMappingURL=client.js.map