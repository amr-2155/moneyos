import type { FastifyInstance } from "fastify";
import type { Db } from "../../db/client.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: { db: Db; appName: string },
): void {
  app.get("/health", async () => {
    const dbOk = checkDatabase(deps.db);
    return {
      status: dbOk ? "ok" : "degraded",
      name: deps.appName,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbOk ? "ok" : "error",
    };
  });
}

function checkDatabase(db: Db): boolean {
  try {
    return db.$client.prepare("SELECT 1").get() !== undefined;
  } catch {
    return false;
  }
}
