import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CategoryRuleView } from "./api";
import { matchRule } from "./categorization";

/**
 * Loads the user's category rules once and returns the best match for the text
 * they are typing, or null.
 *
 * Matching happens in memory so it can run on every keystroke without touching
 * IndexedDB.
 */
export function useCategorySuggestion(input: {
  description: string;
  type: "expense" | "income";
  enabled: boolean;
}): { match: CategoryRuleView | null; reload: () => void } {
  const [rules, setRules] = useState<CategoryRuleView[]>([]);

  const reload = useCallback(() => {
    void api.categoryRules
      .list()
      .then(setRules)
      .catch(() => undefined);
  }, []);

  useEffect(() => reload(), [reload]);

  const match = useMemo(() => {
    if (!input.enabled || input.description.trim() === "") return null;
    return matchRule(input.description, rules, input.type);
  }, [input.description, input.enabled, input.type, rules]);

  return { match, reload };
}