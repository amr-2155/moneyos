import { api } from "./api";

/**
 * Checks if an additional expense of `amountMinor` can be afforded given
 * current budget state (all active budgets for the current month).
 *
 * Returns:
 * - ok: true if there is room in at least one budget, or if no budgets exist.
 * - reason: short Arabic/English phrase explaining the decision.
 * - details: per-category remaining amounts for UI.
 */
export async function isWithinCapacity(
  amountMinor: number
): Promise<{
  ok: boolean;
  reason: string;
  details: Array<{ categoryName: string; remainingMinor: number; percentUsed: number }>;
}> {
  const budgets = await api.budgets.list({});

  // If user has no active budgets → allow (no restriction)
  if (budgets.length === 0) {
    return { ok: true, reason: "no_budgets", details: [] };
  }

  const totalRemaining = budgets.reduce((sum, b) => sum + b.amountMinor * (1 - b.percentUsed / 100), 0);

  if (amountMinor <= totalRemaining) {
    return {
      ok: true,
      reason: "within_budget",
      details: budgets.map((b) => ({
        categoryName: b.categoryName,
        remainingMinor: b.amountMinor - Math.round(b.amountMinor * (b.percentUsed / 100)),
        percentUsed: b.percentUsed,
      })),
    };
  }

  // Over budget — find which categories are most stressed
  const over = budgets.filter((b) => b.percentUsed >= 100).map((b) => b.categoryName);

  return {
    ok: false,
    reason: over.length > 0 ? "over_budget" : "near_limit",
    details: budgets.map((b) => ({
      categoryName: b.categoryName,
      remainingMinor: b.amountMinor - Math.round(b.amountMinor * (b.percentUsed / 100)),
      percentUsed: b.percentUsed,
    })),
  };
}