import type { CategoryView } from "./api";

/**
 * Categories selectable for a transaction of the given type. Includes the
 * seeded system categories (never filtered out) and shared "both" categories.
 */
export function transactionCategoryOptions(
  categories: CategoryView[],
  type: "income" | "expense",
): CategoryView[] {
  return categories.filter((category) => !category.isArchived && (category.type === type || category.type === "both"));
}
