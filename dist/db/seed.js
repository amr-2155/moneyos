import { count, isNull } from "drizzle-orm";
import { categories } from "./schema.js";
/** System categories (userId = null) available to every user on signup. */
const SYSTEM_CATEGORIES = [
    { name: "Salary", type: "income" },
    { name: "Business", type: "income" },
    { name: "Investments", type: "income" },
    { name: "Gifts", type: "income" },
    { name: "Other income", type: "income" },
    { name: "Food & Dining", type: "expense" },
    { name: "Transport", type: "expense" },
    { name: "Housing", type: "expense" },
    { name: "Utilities", type: "expense" },
    { name: "Shopping", type: "expense" },
    { name: "Health", type: "expense" },
    { name: "Education", type: "expense" },
    { name: "Entertainment", type: "expense" },
    { name: "Travel", type: "expense" },
    { name: "Other expenses", type: "expense" },
];
/**
 * Seeds default system categories. Idempotent: does nothing once system
 * categories exist, so it is safe to run on every migration.
 */
export function seedDefaults(db) {
    const existing = db
        .select({ total: count() })
        .from(categories)
        .where(isNull(categories.userId))
        .get();
    if ((existing?.total ?? 0) > 0) {
        return;
    }
    db.insert(categories)
        .values(SYSTEM_CATEGORIES.map((c) => ({ userId: null, name: c.name, type: c.type })))
        .run();
}
//# sourceMappingURL=seed.js.map