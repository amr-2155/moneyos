export function registerHealthRoutes(app, deps) {
    app.get("/health", async () => {
        const dbOk = checkDatabase(deps.db);
        return {
            status: dbOk ? "ok" : "degraded",
            name: deps.appName,
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
            database: dbOk ? "ok" : "error",
            free: true,
            message: "MoneyOS is free for everyone — مجاني تمامًا لوجه الله",
        };
    });
}
function checkDatabase(db) {
    try {
        return db.$client.prepare("SELECT 1").get() !== undefined;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=health.routes.js.map