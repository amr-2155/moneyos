/**
 * Folds the differences that make Arabic text feel mismatched: diacritics,
 * tatweel, and the alternate letter forms people type interchangeably
 * (أ/إ/آ → ا, ى → ي, ة → ه).
 *
 * Shared by search and by category rules so both agree on what "the same word"
 * means.
 */
export function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    // NFKD splits أ into ا + a combining hamza, so the combining marks have to
    // go too — otherwise the alef mapping below never sees a plain alef.
    .replace(/[\u064B-\u0655\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/\s+/g, " ")
    .trim();
}