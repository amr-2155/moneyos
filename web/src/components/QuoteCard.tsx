import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { QUOTE_CATEGORIES, QUOTES } from "../lib/quotes";
import { Icon } from "./Icon";

const AUTO_MS = 15000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const indices = () => Array.from({ length: QUOTES.length }, (_, i) => i);

interface Deck {
  order: number[];
  pos: number;
}

function advance(deck: Deck): Deck {
  if (deck.pos + 1 >= deck.order.length) {
    const order = shuffle(indices());
    if (order[0] === deck.order[deck.pos]) {
      [order[0], order[1]] = [order[1], order[0]];
    }
    return { order, pos: 0 };
  }
  return { ...deck, pos: deck.pos + 1 };
}

export function QuoteCard() {
  const { t, locale } = useI18n();
  const [deck, setDeck] = useState<Deck>(() => ({ order: shuffle(indices()), pos: 0 }));
  const [paused, setPaused] = useState(false);

  const goNext = useCallback(() => setDeck(advance), []);

  useEffect(() => {
    if (paused) {
      return;
    }
    const id = window.setInterval(goNext, AUTO_MS);
    return () => window.clearInterval(id);
  }, [paused, goNext]);

  const quote = QUOTES[deck.order[deck.pos]!]!;
  const category = QUOTE_CATEGORIES[quote.category];
  const author = quote.author ? (locale === "ar" ? quote.author.ar : quote.author.en) : null;

  return (
    <section
      className={`quote-card ${quote.category}`}
      aria-label={t("quotes.title")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="quote-top">
        <span className="quote-badge">
          <span aria-hidden>{category.emoji}</span> {t(category.labelKey)}
        </span>
      </div>

      <blockquote key={quote.id} className="quote-text">
        {locale === "ar" ? quote.ar : quote.en}
      </blockquote>
      {author ? <p className="quote-author">— {author}</p> : null}

      <div className="quote-controls">
        <button type="button" className="quote-btn quote-btn-next" aria-label={t("quotes.next")} onClick={goNext}>
          <Icon name="arrow-right" size={18} />
        </button>
      </div>
    </section>
  );
}
