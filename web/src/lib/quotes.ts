import type { TranslationKey } from "../i18n";

export type QuoteCategory = "charity" | "investing" | "saving" | "motivation" | "money";

export interface Quote {
  id: string;
  category: QuoteCategory;
  ar: string;
  en: string;
  author?: { ar: string; en: string };
}

export const QUOTE_CATEGORIES: Record<QuoteCategory, { labelKey: TranslationKey; emoji: string }> = {
  charity: { labelKey: "quotes.charity", emoji: "🤲" },
  investing: { labelKey: "quotes.investing", emoji: "📈" },
  saving: { labelKey: "quotes.saving", emoji: "🏦" },
  motivation: { labelKey: "quotes.motivation", emoji: "🔥" },
  money: { labelKey: "quotes.money", emoji: "💰" },
};

interface Slot {
  ar: string[];
  en: string[];
}

interface Template {
  ar: (a: string, b: string) => string;
  en: (a: string, b: string) => string;
}

function expand(category: QuoteCategory, templates: Template[], a: Slot, b: Slot): Quote[] {
  const out: Quote[] = [];
  for (let ti = 0; ti < templates.length; ti++) {
    const t = templates[ti]!;
    for (let i = 0; i < a.ar.length; i++) {
      for (let j = 0; j < b.ar.length; j++) {
        out.push({
          id: `${category}-${ti}-${i}-${j}`,
          category,
          ar: t.ar(a.ar[i]!, b.ar[j]!),
          en: t.en(a.en[i]!, b.en[j]!),
        });
      }
    }
  }
  return out;
}

const charityTemplates: Template[] = [
  { ar: (a, b) => `الصدقة ${a} ${b}.`, en: (a, b) => `Charity ${a} ${b}.` },
  { ar: (a, b) => `أفضل الصدقة ${a} ${b}.`, en: (a, b) => `The best charity ${a} ${b}.` },
  { ar: (a, b) => `مَن ${a} ${b}.`, en: (a, b) => `Whoever ${a} ${b}.` },
  { ar: (a, b) => `${a} خيرٌ من ${b}.`, en: (a, b) => `${a} is better than ${b}.` },
  { ar: (a, b) => `حين تُخرج الصدقة، ${a} ${b}.`, en: (a, b) => `When you give in charity, ${a} ${b}.` },
  { ar: (a, b) => `لو لم يكن للصدقة أثرٌ إلا ${a}، ${b}.`, en: (a, b) => `If charity had no effect but ${a}, ${b}.` },
  { ar: (a, b) => `الصدقة في ${b} ${a}.`, en: (a, b) => `Charity in ${b} ${a}.` },
];

const charityA: Slot = {
  ar: ["تفتح أبواب البركة", "تزرع الخير في القلب", "تمسح الهمَّ عن الوجوه الحزينة", "تنمو في المال ولا تنقصه"],
  en: ["opens the doors of blessing", "plants goodness in the heart", "wipes sorrow off sad faces", "grows wealth instead of shrinking it"],
};

const charityB: Slot = {
  ar: ["حتى لو كانت قليلة", "في كل وقتٍ وأوان", "وتعود بالأجر والطمأنينة", "في حياتك وفي مالك"],
  en: ["even when it's small", "at all times", "and returns with reward and peace", "in your life and in your money"],
};

const investingTemplates: Template[] = [
  { ar: (a, b) => `${a} ${b}.`, en: (a, b) => `${a} ${b}.` },
  { ar: (a, b) => `استثمر في ${a} ${b}.`, en: (a, b) => `Invest in ${a} ${b}.` },
  { ar: (a, b) => `${a} لا يصنع الثروة، ${b}.`, en: (a, b) => `${a} doesn't build wealth, ${b}.` },
  { ar: (a, b) => `المال الذي يعمل ${a}، ${b}.`, en: (a, b) => `Money that works ${a} ${b}.` },
  { ar: (a, b) => `الفائدة المركبة ${a} ${b}.`, en: (a, b) => `Compound interest ${a} ${b}.` },
  { ar: (a, b) => `الاستثمار رحلة ${a}، ${b}.`, en: (a, b) => `Investing is ${a}; ${b}.` },
  { ar: (a, b) => `المستثمر الناجح ${a} ${b}.`, en: (a, b) => `A successful investor ${a} ${b}.` },
];

const investingA: Slot = {
  ar: ["الاستثمار المبكر", "تنويع المحفظة", "الصبر على التقلبات", "التعلّم المستمر عن المال"],
  en: ["early investing", "diversifying your portfolio", "patience through volatility", "continuous learning about money"],
};

const investingB: Slot = {
  ar: ["أقصر طريق إلى الثراء", "درعٌ يحمي أموالك", "علامة المستثمر الناضج", "أصلٌ لا يُقدَّر بثمن"],
  en: ["is the shortest path to wealth", "is a shield for your money", "is the mark of a mature investor", "is a priceless asset"],
};

const savingTemplates: Template[] = [
  { ar: (a, b) => `${a} ${b}.`, en: (a, b) => `${a} ${b}.` },
  { ar: (a, b) => `ادّخر ${a} ${b}.`, en: (a, b) => `Save ${a} ${b}.` },
  { ar: (a, b) => `الادخار ليس ${a}، بل ${b}.`, en: (a, b) => `Saving isn't ${a}; it's ${b}.` },
  { ar: (a, b) => `على مدى السنين، ${a} ${b}.`, en: (a, b) => `Over the years, ${a} ${b}.` },
  { ar: (a, b) => `ميزانيتك ${a} ${b}.`, en: (a, b) => `A ${a} budget ${b}.` },
  { ar: (a, b) => `الأمان المالي يأتي ${a} ${b}.`, en: (a, b) => `Financial security comes ${a} ${b}.` },
  { ar: (a, b) => `المدّخر الحقيقي ${a} ${b}.`, en: (a, b) => `A true saver ${a} ${b}.` },
];

const savingA: Slot = {
  ar: ["الادخار المنتظم", "المبلغ الصغير المتكرر", "أتمتة التحويل للادخار", "حساب طوارئ جاهز"],
  en: ["regular saving", "the small repeated amount", "automating your transfers to savings", "a ready emergency fund"],
};

const savingB: Slot = {
  ar: ["أصل العادات المالية السليمة", "يصنع الفرق مع الوقت", "أضمن وسيلة للالتزام", "يمنحك نومًا هادئًا"],
  en: ["is the root of sound money habits", "makes the difference over time", "is the surest way to stay committed", "gives you a peaceful sleep"],
};

const motivationTemplates: Template[] = [
  { ar: (a, b) => `ابدأ ${a} ${b}.`, en: (a, b) => `Start ${a} ${b}.` },
  { ar: (a, b) => `النجاح ${a} ${b}.`, en: (a, b) => `Success ${a} ${b}.` },
  { ar: (a, b) => `لا تدع ${a} ${b}.`, en: (a, b) => `Don't let ${a} ${b}.` },
  { ar: (a, b) => `عندما تشعر ${a}، ${b}.`, en: (a, b) => `When you feel ${a}, ${b}.` },
  { ar: (a, b) => `الفرق بين ${a} ${b}.`, en: (a, b) => `The difference between ${a} ${b}.` },
  { ar: (a, b) => `اجعل ${a} ${b}.`, en: (a, b) => `Make ${a} ${b}.` },
  { ar: (a, b) => `لن تندم على ${a} ${b}.`, en: (a, b) => `You won't regret ${a} ${b}.` },
];

const motivationA: Slot = {
  ar: ["بخطوة صغيرة", "اليوم", "بالأهم أولًا", "من حيث أنت"],
  en: ["with a small step", "today", "with what matters most", "from where you are"],
};

const motivationB: Slot = {
  ar: ["فكل عادة تبدأ هكذا", "فغدًا يبتعد بلا بداية", "ولا تؤجل حلمك لدقيقة", "وليس من حيث يبدأ غيرك"],
  en: ["for every habit starts this way", "for tomorrow drifts without a start", "and don't delay your dream a minute", "not from where others start"],
};

const moneyTemplates: Template[] = [
  { ar: (a, b) => `${a} ${b}.`, en: (a, b) => `${a} ${b}.` },
  { ar: (a, b) => `المال ليس ${a}، بل ${b}.`, en: (a, b) => `Money isn't ${a}; it's ${b}.` },
  { ar: (a, b) => `مَن أحسن ${a}، ${b}.`, en: (a, b) => `Whoever masters ${a} ${b}.` },
  { ar: (a, b) => `كل مبلغ ${a} ${b}.`, en: (a, b) => `Every amount ${a} ${b}.` },
  { ar: (a, b) => `أنفق على ${a} ${b}.`, en: (a, b) => `Spend on ${a} ${b}.` },
  { ar: (a, b) => `من يجهل ${a}، ${b}.`, en: (a, b) => `Whoever ignores ${a} ${b}.` },
  { ar: (a, b) => `احترام المال يبدأ ${a} ${b}.`, en: (a, b) => `Respecting money starts ${a} ${b}.` },
];

const moneyA: Slot = {
  ar: ["المال الطيب", "التحكم في مالك", "التخطيط المالي", "عقلية الوفرة"],
  en: ["good money", "control over your money", "financial planning", "an abundance mindset"],
};

const moneyB: Slot = {
  ar: ["يأتي بالبركة والخير", "أصل الحرية والاستقرار", "يجعل القليل يفي بالكثير", "تفتح أبواب الفرص"],
  en: ["comes with blessing and goodness", "is the root of freedom and stability", "makes the little cover much", "opens the doors of opportunity"],
};

const QUOTE_SPECIALS: Quote[] = [
  {
    id: "special-compound",
    category: "investing",
    ar: "الفائدة المركبة هي الأعجوبة الثامنة في العالم.",
    en: "Compound interest is the eighth wonder of the world.",
    author: { ar: "ألبرت أينشتاين", en: "Albert Einstein" },
  },
  {
    id: "special-thousand-miles",
    category: "motivation",
    ar: "الطريق إلى ألف ميل يبدأ بخطوة واحدة.",
    en: "A journey of a thousand miles begins with a single step.",
    author: { ar: "مثل صيني", en: "Chinese proverb" },
  },
  {
    id: "special-eggs",
    category: "investing",
    ar: "لا تضع كل بيضك في سلة واحدة.",
    en: "Don't put all your eggs in one basket.",
    author: { ar: "مثل مأثور", en: "Common saying" },
  },
  {
    id: "special-servant",
    category: "money",
    ar: "المال عبدٌ صالح لصاحبه العاقل، وربٌّ قاسٍ لمن ينسى قيمته.",
    en: "Money is a good servant to the wise and a harsh master to those who forget its worth.",
  },
];

export const QUOTES: Quote[] = [
  ...expand("charity", charityTemplates, charityA, charityB),
  ...expand("investing", investingTemplates, investingA, investingB),
  ...expand("saving", savingTemplates, savingA, savingB),
  ...expand("motivation", motivationTemplates, motivationA, motivationB),
  ...expand("money", moneyTemplates, moneyA, moneyB),
  ...QUOTE_SPECIALS,
].filter((q) => !/[\d٠-٩]/.test(q.ar) && !/[\d٠-٩]/.test(q.en));
