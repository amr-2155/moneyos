import { describe, expect, it } from "vitest";
import {
  derivePattern,
  matchRule,
  normalizePattern,
  planLearning,
  type CategoryRuleLike,
} from "./categorization";

function rule(overrides: Partial<CategoryRuleLike> & { pattern: string }): CategoryRuleLike {
  return {
    id: overrides.pattern,
    categoryId: "groceries",
    type: "expense",
    hits: 0,
    isActive: true,
    ...overrides,
  };
}

describe("normalizePattern", () => {
  it("folds Arabic letter variants so spelling differences still match", () => {
    expect(normalizePattern("أحمد")).toBe(normalizePattern("احمد"));
    expect(normalizePattern("مقهى")).toBe(normalizePattern("مقهي"));
    expect(normalizePattern("شركة")).toBe(normalizePattern("شركه"));
  });

  it("drops diacritics, tatweel and punctuation", () => {
    expect(normalizePattern("مَارْكِت")).toBe("ماركت");
    expect(normalizePattern("Carrefour -- Maadi!")).toBe("carrefour maadi");
  });

  it("collapses repeated spaces", () => {
    expect(normalizePattern("  Uber   Trip  ")).toBe("uber trip");
  });
});

describe("derivePattern", () => {
  it("picks the word that identifies the merchant", () => {
    expect(derivePattern("كارفور المعادي 22 اكتوبر")).toBe("كارفور");
  });

  it("ignores digits, short words and filler", () => {
    expect(derivePattern("دفعت في 12 كافيه")).toBe("كافيه");
  });

  it("returns null when nothing meaningful is left", () => {
    expect(derivePattern("دفعت 50")).toBeNull();
    expect(derivePattern("")).toBeNull();
  });
});

describe("matchRule", () => {
  const rules = [
    rule({ pattern: "كارفور", hits: 2 }),
    rule({ pattern: "كارفور ماركت", hits: 1, categoryId: "market" }),
  ];

  it("matches a word inside the description", () => {
    expect(matchRule("فروع كارفور المعادي", rules, "expense")?.categoryId).toBe("groceries");
  });

  it("prefers the more specific pattern", () => {
    expect(matchRule("كارفور ماركت", rules, "expense")?.pattern).toBe("كارفور ماركت");
  });

  it("does not match inside another word", () => {
    const short = [rule({ pattern: "مرس" })];
    expect(matchRule("مرسيدس", short, "expense")).toBeNull();
  });

  it("ignores rules of the other type", () => {
    expect(matchRule("كارفور", [rule({ pattern: "كارفور", type: "income" })], "expense")).toBeNull();
    expect(matchRule("كارفور", [rule({ pattern: "كارفور", type: "any" })], "income")).not.toBeNull();
  });

  it("ignores paused rules", () => {
    expect(matchRule("كارفور", [rule({ pattern: "كارفور", isActive: false })], "expense")).toBeNull();
  });

  it("breaks ties by how often the rule was confirmed", () => {
    const tied = [
      rule({ pattern: "اوبر", categoryId: "transport", hits: 1 }),
      rule({ pattern: "اوبر", categoryId: "work", hits: 9 }),
    ];
    expect(matchRule("اوبر", tied, "expense")?.categoryId).toBe("work");
  });
});

describe("planLearning", () => {
  it("creates a rule the first time it sees a merchant", () => {
    const plan = planLearning("كارفور المعادي", "groceries", "expense", []);
    expect(plan).toEqual({ kind: "create", pattern: "كارفور", categoryId: "groceries", type: "expense" });
  });

  it("confirms a rule the user agreed with", () => {
    const existing = rule({ pattern: "كارفور", hits: 3 });
    expect(planLearning("كارفور ماركت", "groceries", "expense", [existing])).toEqual({
      kind: "confirm",
      rule: existing,
    });
  });

  it("moves a rule when the user corrects the category", () => {
    const existing = rule({ pattern: "كارفور", categoryId: "groceries", hits: 3 });
    expect(planLearning("كارفور", "household", "expense", [existing])).toEqual({
      kind: "move",
      rule: existing,
      categoryId: "household",
    });
  });

  it("does not teach from an empty description", () => {
    expect(planLearning("", "groceries", "expense", [])).toBeNull();
  });
});