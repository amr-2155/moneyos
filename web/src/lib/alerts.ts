import { api } from "./api";
import { today } from "./recurring";

export type AlertSeverity = "danger" | "warning" | "success";

interface AlertBase {
  /** Stable across renders; used to remember dismissals. */
  id: string;
  severity: AlertSeverity;
}

export type AppAlert =
  | (AlertBase & { kind: "bill-overdue"; ruleName: string; dueDate: string; daysLate: number })
  | (AlertBase & { kind: "bill-due"; ruleName: string; dueDate: string })
  | (AlertBase & { kind: "bill-soon"; ruleName: string; dueDate: string })
  | (AlertBase & { kind: "budget-over"; categoryName: string; percent: number })
  | (AlertBase & { kind: "budget-warning"; categoryName: string; percent: number })
  | (AlertBase & { kind: "goal-reached"; goalName: string });

const SEVERITY_RANK: Record<AlertSeverity, number> = { danger: 0, warning: 1, success: 2 };

export function alertHref(alert: AppAlert): string {
  switch (alert.kind) {
    case "bill-overdue":
    case "bill-due":
    case "bill-soon":
      return "/recurring";
    case "budget-over":
    case "budget-warning":
      return "/budgets";
    case "goal-reached":
      return "/goals";
  }
}

/**
 * Days between two YYYY-MM-DD dates, without going through Date's UTC parsing.
 * Positive means `later` is after `earlier`.
 */
function daysBetween(earlier: string, later: string): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(later) - parse(earlier)) / 86_400_000);
}

/**
 * Everything worth telling the user right now: bills that are due or close,
 * budgets that are nearly spent, goals that reached their target.
 *
 * Kept in one place so the in-app bell and any future scheduled notification
 * agree on what counts as an alert.
 */
export async function computeAlerts(): Promise<AppAlert[]> {
  const alerts: AppAlert[] = [];
  const now = today();

  const [rules, budgets, goals] = await Promise.all([
    api.recurring.list().catch(() => []),
    api.budgets.list({}).catch(() => []),
    api.savingsGoals.list({}).catch(() => []),
  ]);

  for (const rule of rules) {
    if (!rule.isActive || !rule.nextDueDate) continue;

    const dueIn = -daysBetween(now, rule.nextDueDate);
    const id = `bill:${rule.id}:${rule.nextDueDate}`;

    if (dueIn < 0) {
      alerts.push({
        id,
        kind: "bill-overdue",
        severity: "danger",
        ruleName: rule.name,
        dueDate: rule.nextDueDate,
        daysLate: Math.abs(dueIn),
      });
    } else if (dueIn === 0) {
      alerts.push({ id, kind: "bill-due", severity: "warning", ruleName: rule.name, dueDate: rule.nextDueDate });
    } else if (rule.reminderDate && rule.reminderDate <= now) {
      alerts.push({ id, kind: "bill-soon", severity: "warning", ruleName: rule.name, dueDate: rule.nextDueDate });
    }
  }

  for (const budget of budgets) {
    if (budget.isArchived) continue;
    const id = `budget:${budget.id}:${budget.period}`;

    if (budget.status === "exceeded") {
      alerts.push({
        id,
        kind: "budget-over",
        severity: "danger",
        categoryName: budget.categoryName,
        percent: budget.percentUsed,
      });
    } else if (budget.status === "approaching") {
      alerts.push({
        id,
        kind: "budget-warning",
        severity: "warning",
        categoryName: budget.categoryName,
        percent: budget.percentUsed,
      });
    }
  }

  for (const goal of goals) {
    if (goal.isArchived || !goal.achieved) continue;
    alerts.push({ id: `goal:${goal.id}`, kind: "goal-reached", severity: "success", goalName: goal.name });
  }

  return alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
