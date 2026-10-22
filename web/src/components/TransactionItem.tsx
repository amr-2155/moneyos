import type { TransactionView } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { RelativeDay } from "./RelativeDay";

const TYPE_ICON: Record<TransactionView["type"], IconName> = {
  income: "trendup",
  expense: "trenddown",
  transfer: "swap",
};

export function TransactionItem({
  tx,
  title,
  subtitle,
  amountOverride,
  actions,
  showRelative = true,
}: {
  tx: TransactionView;
  title?: string;
  subtitle?: string;
  amountOverride?: string;
  actions?: React.ReactNode;
  /** Off where the date is already shown, so the row does not repeat itself. */
  showRelative?: boolean;
}) {
  const isIncome = tx.type === "income";
  const isExpense = tx.type === "expense";
  const amount = amountOverride ?? formatCurrency(Math.abs(tx.amountMinor), tx.currency);
  const sign = isIncome ? "+" : isExpense ? "−" : "";
  return (
    <li className="list-item">
      <span className={`tx-icon ${tx.type}`}>
        <Icon name={TYPE_ICON[tx.type] ?? "list"} />
      </span>
      <div className="tx-main">
        <div className="tx-title">{title ?? tx.description ?? tx.type}</div>
        {subtitle || showRelative ? (
          <div className="tx-sub">
            {subtitle ? <span className="tx-sub-text">{subtitle}</span> : null}
            {subtitle && showRelative ? (
              <span className="tx-sep" aria-hidden>
                ·
              </span>
            ) : null}
            {showRelative ? <RelativeDay date={tx.date} /> : null}
          </div>
        ) : null}
      </div>
      <div className={`tx-amount${isIncome ? " positive" : isExpense ? " negative" : ""}`}>
        {sign}
        {amount}
      </div>
      {actions}
    </li>
  );
}
