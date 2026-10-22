import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useI18n, type TranslationKey } from "../i18n";
import { api, type TransactionView } from "../lib/api";
import { formatCurrency, formatDate } from "../lib/format";
import { foldText } from "../lib/text";
import { useTheme } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

type Group = "pages" | "actions" | "transactions";

interface Command {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon: IconName;
  /** Extra text that should match the query but is not shown. */
  keywords?: string;
  run: () => void;
}

const PAGES: { to: string; label: TranslationKey; icon: IconName }[] = [
  { to: "/", label: "nav.home", icon: "home" },
  { to: "/add", label: "nav.add", icon: "plus" },
  { to: "/transactions", label: "nav.transactions", icon: "list" },
  { to: "/reports", label: "nav.reports", icon: "trendup" },
  { to: "/budgets", label: "nav.budgets", icon: "target" },
  { to: "/goals", label: "nav.goals", icon: "star" },
  { to: "/recurring", label: "nav.recurring", icon: "refresh" },
  { to: "/accounts", label: "nav.accounts", icon: "bank" },
  { to: "/transfers", label: "nav.transfers", icon: "swap" },
  { to: "/categories", label: "nav.categories", icon: "tag" },
  { to: "/settings", label: "nav.settings", icon: "settings" },
  { to: "/more", label: "nav.more", icon: "more" },
];

const GROUP_ORDER: Group[] = ["pages", "actions", "transactions"];

/**
 * Folds the differences that make Arabic search feel broken: diacritics,
 * tatweel, and the alternate letter forms people type interchangeably.
 */
const normalize = foldText;

/** Lower is better; `-1` means "does not match". */
function score(haystack: string, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const at = haystack.indexOf(token);
    if (at === -1) {
      return -1;
    }
    total += at === 0 ? 0 : haystack[at - 1] === " " ? 1 : 2;
  }
  return total;
}

function searchScore(command: Command, tokens: string[]): number {
  return score(normalize(`${command.label} ${command.keywords ?? ""}`), tokens);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { resolved, setMode } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [transactions, setTransactions] = useState<TransactionView[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const baseId = useId();
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (!open || transactions !== null) {
      return;
    }
    let cancelled = false;
    api.transactions
      .list({ limit: 100 })
      .then((page) => {
        if (!cancelled) {
          setTransactions(page.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, transactions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    restoreFocus.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      restoreFocus.current?.focus?.();
    };
  }, [open]);

  const go = useCallback(
    (to: string) => {
      onClose();
      navigate(to);
    },
    [navigate, onClose],
  );

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = PAGES.map((page) => ({
      id: `page:${page.to}`,
      group: "pages",
      label: t(page.label),
      icon: page.icon,
      run: () => go(page.to),
    }));

    const actions: Command[] = [
      {
        id: "action:expense",
        group: "actions",
        label: t("command.addExpense"),
        icon: "trenddown",
        run: () => go("/add?type=expense"),
      },
      {
        id: "action:income",
        group: "actions",
        label: t("command.addIncome"),
        icon: "trendup",
        run: () => go("/add?type=income"),
      },
      {
        id: "action:theme",
        group: "actions",
        label: t("command.toggleTheme"),
        icon: resolved === "dark" ? "sun" : "moon",
        run: () => {
          onClose();
          setMode(resolved === "dark" ? "light" : "dark");
        },
      },
    ];

    const txs: Command[] = (transactions ?? []).map((tx) => {
      const name = tx.description?.trim() || t("command.noDescription");
      return {
        id: `tx:${tx.id}`,
        group: "transactions",
        label: t("command.editTransaction", { name }),
        hint: `${formatDate(tx.date)} · ${formatCurrency(tx.amountMinor, tx.currency)}`,
        icon: tx.type === "income" ? "trendup" : "trenddown",
        keywords: `${tx.notes ?? ""} ${tx.amountMinor} ${tx.date}`,
        run: () => {
          onClose();
          navigate("/add", { state: { tx } });
        },
      };
    });

    return [...pages, ...actions, ...txs];
  }, [t, go, resolved, setMode, onClose, navigate, transactions]);

  const tokens = useMemo(() => normalize(query).split(" ").filter(Boolean), [query]);

  const results = useMemo(() => {
    return commands
      .map((command) => ({ command, rank: searchScore(command, tokens) }))
      .filter((entry) => entry.rank !== -1)
      .sort((a, b) => a.rank - b.rank || GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group))
      .slice(0, query.trim() ? 40 : 20)
      .map((entry) => entry.command);
  }, [commands, tokens, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active, results]);

  if (!open) {
    return null;
  }

  const select = (command: Command | undefined) => {
    if (command) {
      command.run();
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
      return;
    }
    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      select(results[active]);
    }
  };

  const seenGroups = new Set<Group>();

  return createPortal(
    <div
      className="cmdk-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label={t("command.title")} onKeyDown={onKeyDown}>
        <div className="cmdk-search">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("command.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
            aria-label={t("command.placeholder")}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="cmdk-kbd">{t("command.shortcut")}</kbd>
        </div>

        <div className="cmdk-list" id={`${baseId}-list`} role="listbox" ref={listRef} aria-label={t("command.title")}>
          {results.length === 0 ? <p className="cmdk-empty">{t("command.empty")}</p> : null}
          {results.map((command, index) => {
            const heading = seenGroups.has(command.group) ? null : command.group;
            seenGroups.add(command.group);
            return (
              <div key={command.id}>
                {heading ? (
                  <p className="cmdk-group">
                    {heading === "pages"
                      ? t("command.groupPages")
                      : heading === "actions"
                        ? t("command.groupActions")
                        : t("command.groupTransactions")}
                  </p>
                ) : null}
                <button
                  type="button"
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className={`cmdk-item${index === active ? " active" : ""}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => select(command)}
                >
                  <Icon name={command.icon} size={18} />
                  <span className="cmdk-item-label">{command.label}</span>
                  {command.hint ? <span className="cmdk-item-hint">{command.hint}</span> : null}
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmdk-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t("command.hint")}
          </span>
          <span>
            <kbd>Enter</kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}