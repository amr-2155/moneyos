import type { SavingsContributionView } from "./api";

export interface Distribution {
  savingsPct: number;
  investPct: number;
}

const KEY = "moneyos.distribution";

export const DEFAULT_DISTRIBUTION: Distribution = { savingsPct: 30, investPct: 20 };

function clampPct(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function loadDistribution(): Distribution {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Distribution>;
      const savingsPct = clampPct(parsed.savingsPct);
      const investPct = clampPct(parsed.investPct);
      if (savingsPct + investPct <= 100) {
        return { savingsPct, investPct };
      }
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_DISTRIBUTION };
}

export function saveDistribution(distribution: Distribution): void {
  localStorage.setItem(KEY, JSON.stringify(distribution));
}

export function spendingPct(distribution: Distribution): number {
  return 100 - distribution.savingsPct - distribution.investPct;
}

export interface MonthlyTargets {
  savingsMinor: number;
  investMinor: number;
  spendingMinor: number;
}

export function monthlyTargets(incomeMinor: number, distribution: Distribution): MonthlyTargets {
  return {
    savingsMinor: Math.round((incomeMinor * distribution.savingsPct) / 100),
    investMinor: Math.round((incomeMinor * distribution.investPct) / 100),
    spendingMinor: Math.round((incomeMinor * spendingPct(distribution)) / 100),
  };
}

export type GoalKind = "savings" | "investment";

export function goalKind(name: string): GoalKind {
  const lower = name.toLowerCase();
  return lower.includes("invest") || lower.includes("استثمار") ? "investment" : "savings";
}

export function contributionsInMonth(contributions: SavingsContributionView[], month: string): number {
  return contributions
    .filter((contribution) => contribution.createdAt.slice(0, 7) === month)
    .reduce((sum, contribution) => sum + contribution.amountMinor, 0);
}
