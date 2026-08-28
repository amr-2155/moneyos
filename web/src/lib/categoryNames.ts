import type { CategoryView } from "./api";

const CATEGORY_NAMES: Record<string, { en: string; ar: string }> = {
  Salary: { en: "Salary", ar: "راتب" },
  Business: { en: "Business", ar: "أعمال" },
  Investments: { en: "Investments", ar: "استثمارات" },
  Gifts: { en: "Gifts", ar: "هدايا" },
  "Other income": { en: "Other income", ar: "دخل آخر" },
  "Food & Dining": { en: "Food & Dining", ar: "أكل وشرب" },
  Transport: { en: "Transport", ar: "مواصلات" },
  Housing: { en: "Housing", ar: "سكن" },
  Utilities: { en: "Utilities", ar: "مرافق" },
  Shopping: { en: "Shopping", ar: "تسوق" },
  Health: { en: "Health", ar: "صحة" },
  Education: { en: "Education", ar: "تعليم" },
  Entertainment: { en: "Entertainment", ar: "ترفيه" },
  Travel: { en: "Travel", ar: "سفر" },
  "Other expenses": { en: "Other expenses", ar: "مصروفات أخرى" },
  راتب: { en: "Salary", ar: "راتب" },
  أعمال: { en: "Business", ar: "أعمال" },
  استثمارات: { en: "Investments", ar: "استثمارات" },
  هدايا: { en: "Gifts", ar: "هدايا" },
  "دخل آخر": { en: "Other income", ar: "دخل آخر" },
  "أكل وشرب": { en: "Food & Dining", ar: "أكل وشرب" },
  مواصلات: { en: "Transport", ar: "مواصلات" },
  سكن: { en: "Housing", ar: "سكن" },
  مرافق: { en: "Utilities", ar: "مرافق" },
  تسوق: { en: "Shopping", ar: "تسوق" },
  صحة: { en: "Health", ar: "صحة" },
  تعليم: { en: "Education", ar: "تعليم" },
  ترفيه: { en: "Entertainment", ar: "ترفيه" },
  سفر: { en: "Travel", ar: "سفر" },
  "مصروفات أخرى": { en: "Other expenses", ar: "مصروفات أخرى" },
};

const CATEGORY_EMOJI: Record<string, string> = {
  Salary: "💼",
  Business: "🏢",
  Investments: "📈",
  Gifts: "🎁",
  "Other income": "🪙",
  "Food & Dining": "🍔",
  Transport: "🚕",
  Housing: "🏠",
  Utilities: "💡",
  Shopping: "🛍️",
  Health: "🩺",
  Education: "📚",
  Entertainment: "🎬",
  Travel: "✈️",
  "Other expenses": "🧾",
  راتب: "💼",
  أعمال: "🏢",
  استثمارات: "📈",
  هدايا: "🎁",
  "دخل آخر": "🪙",
  "أكل وشرب": "🍔",
  مواصلات: "🚕",
  سكن: "🏠",
  مرافق: "💡",
  تسوق: "🛍️",
  صحة: "🩺",
  تعليم: "📚",
  ترفيه: "🎬",
  سفر: "✈️",
  "مصروفات أخرى": "🧾",
};

/** Returns a friendly emoji for a category, falling back to a type-based one. */
export function categoryEmoji(name: string, type: CategoryView["type"]): string {
  return CATEGORY_EMOJI[name] ?? (type === "income" ? "💰" : "💸");
}

/** Translates a category name for the UI. Unknown names pass through unchanged. */
export function localizeCategoryName(name: string, locale: "en" | "ar"): string {
  const entry = CATEGORY_NAMES[name];
  if (!entry) {
    return name;
  }
  return locale === "ar" ? entry.ar : entry.en;
}
