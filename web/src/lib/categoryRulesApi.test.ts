import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./api";
import { db } from "./db";
import { setActiveUserId } from "./session";
import { matchRule } from "./categorization";

const USER = "rules-user";

async function seedCategory(name: string) {
  return api.categories.create({ name, type: "expense" });
}

describe("category rules", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    localStorage.clear();
    setActiveUserId(USER);
  });

  it("learns a rule from the first saved transaction", async () => {
    const groceries = await seedCategory("Groceries");

    await api.categoryRules.learn({ description: "كارفور المعادي", categoryId: groceries.id, type: "expense" });

    const [rule] = await api.categoryRules.list();
    expect(rule?.pattern).toBe("كارفور");
    expect(rule?.categoryId).toBe(groceries.id);
    expect(rule?.hits).toBe(1);
    expect(rule?.source).toBe("learned");
  });

  it("confirms the rule instead of duplicating it when the user agrees again", async () => {
    const groceries = await seedCategory("Groceries");

    await api.categoryRules.learn({ description: "كارفور ماركت", categoryId: groceries.id, type: "expense" });
    await api.categoryRules.learn({ description: "كارفور", categoryId: groceries.id, type: "expense" });

    const rules = await api.categoryRules.list();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.hits).toBe(2);
  });

  it("moves the rule when the user corrects the category", async () => {
    const groceries = await seedCategory("Groceries");
    const household = await seedCategory("Household");

    await api.categoryRules.learn({ description: "كارفور", categoryId: groceries.id, type: "expense" });
    await api.categoryRules.learn({ description: "كارفور", categoryId: household.id, type: "expense" });

    const [rule] = await api.categoryRules.list();
    expect(rule?.categoryId).toBe(household.id);
  });

  it("stops suggesting a rule once it is paused", async () => {
    const groceries = await seedCategory("Groceries");
    await api.categoryRules.learn({ description: "كارفور", categoryId: groceries.id, type: "expense" });
    const [rule] = await api.categoryRules.list();

    await api.categoryRules.setActive(rule!.id, false);

    const rules = await api.categoryRules.list();
    expect(matchRule("كارفور", rules, "expense")).toBeNull();
  });

  it("normalises a hand-made pattern and refuses very short ones", async () => {
    const groceries = await seedCategory("Groceries");

    const created = await api.categoryRules.create({
      pattern: "  Carrefour!! ",
      categoryId: groceries.id,
      type: "any",
    });
    expect(created.pattern).toBe("carrefour");

    await expect(
      api.categoryRules.create({ pattern: "ab", categoryId: groceries.id, type: "any" }),
    ).rejects.toThrow();
  });

  it("keeps the description out of the pattern when it is only filler", async () => {
    const groceries = await seedCategory("Groceries");
    await api.categoryRules.learn({ description: "دفعت 50", categoryId: groceries.id, type: "expense" });

    expect(await api.categoryRules.list()).toHaveLength(0);
  });

  it("can delete a rule and put it back", async () => {
    const groceries = await seedCategory("Groceries");
    await api.categoryRules.learn({ description: "كارفور", categoryId: groceries.id, type: "expense" });
    const [rule] = await api.categoryRules.list();

    const removed = await api.categoryRules.remove(rule!.id);
    expect(await api.categoryRules.list()).toHaveLength(0);

    await api.categoryRules.restore(removed);
    expect(await api.categoryRules.list()).toHaveLength(1);
  });
});