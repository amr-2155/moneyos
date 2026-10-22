import { foldText } from "./text";

export type RuleType = "expense" | "income" | "any";

/** The shape the matcher needs; records may carry more fields. */
export interface CategoryRuleLike {
  id: string;
  pattern: string;
  categoryId: string;
  type: RuleType;
  hits: number;
  isActive: boolean;
}

/** Patterns shorter than this match by accident ("مرس" inside "مرسيدس"). */
export const MIN_PATTERN_LENGTH = 3;

/**
 * Words that appear in almost every description and say nothing about where
 * the money went. Including them would teach rules like "دفعت".
 */
const NOISE_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "payment",
  "purchase",
  "bill",
  "cash",
  "card",
  "في",
  "من",
  "علي",
  "الي",
  "مع",
  "دفع",
  "دفعت",
  "شراء",
  "فاتوره",
  "كاش",
  "فيزا",
  "تحويل",
  "فرع",
  "فروع",
  "طلب",
  "طلبية",
]);

/** Lowercase, punctuation removed, single-spaced, Arabic letters folded. */
export function normalizePattern(text: string): string {
  return foldText(text)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Picks the word most likely to identify the merchant.
 *
 * "كارفور المعادي 22 اكتوبر" → "كارفور", not "المعادي": the definite article
 * usually marks a branch or a street, so tokens without it win first, and the
 * longest of those wins after that. Anything left over is still learnable — a
 * wrong guess is corrected the first time the user picks a different category.
 */
export function derivePattern(description: string): string | null {
  const tokens = normalizePattern(description)
    .split(" ")
    .filter(
      (token) =>
        token.length >= MIN_PATTERN_LENGTH &&
        !NOISE_WORDS.has(token) &&
        !/^\d+$/.test(token),
    );

  if (tokens.length === 0) return null;

  const withoutArticle = tokens.filter((token) => !token.startsWith("ال"));
  const candidates = withoutArticle.length > 0 ? withoutArticle : tokens;
  return candidates.reduce((best, token) => (token.length > best.length ? token : best), "");
}

/**
 * Best rule for a description, or null.
 *
 * Longer patterns win because they are more specific ("كارفور ماركت" over
 * "كارفور"); ties are broken by how often the rule has been confirmed, so the
 * rule the user keeps agreeing with wins.
 */
export function matchRule<T extends CategoryRuleLike>(
  text: string,
  rules: T[],
  type: "expense" | "income",
): T | null {
  const haystack = ` ${normalizePattern(text)} `;
  if (haystack.trim() === "") return null;

  let best: T | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.type !== "any" && rule.type !== type) continue;

    const pattern = normalizePattern(rule.pattern);
    if (pattern.length < MIN_PATTERN_LENGTH) continue;
    if (!haystack.includes(` ${pattern} `)) continue;

    const score = pattern.length * 1000 + Math.min(rule.hits, 999);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }

  return best;
}

export type LearnPlan =
  | { kind: "create"; pattern: string; categoryId: string; type: "expense" | "income" }
  | { kind: "confirm"; rule: CategoryRuleLike }
  | { kind: "move"; rule: CategoryRuleLike; categoryId: string };

/**
 * Decides what saving a transaction should teach the engine.
 *
 * - No rule for this pattern: create one.
 * - Rule already agrees: confirm it (hits go up, so it wins future ties).
 * - Rule disagrees: this is the user correcting us, and the correction is the
 *   strongest signal available, so the rule moves to the new category.
 */
export function planLearning(
  description: string,
  categoryId: string,
  type: "expense" | "income",
  rules: CategoryRuleLike[],
): LearnPlan | null {
  const pattern = derivePattern(description);
  if (!pattern) return null;

  const existing = rules.find(
    (rule) => normalizePattern(rule.pattern) === pattern && (rule.type === type || rule.type === "any"),
  );

  if (!existing) return { kind: "create", pattern, categoryId, type };
  if (existing.categoryId === categoryId) return { kind: "confirm", rule: existing };
  return { kind: "move", rule: existing, categoryId };
}