import { Link } from "react-router-dom";
import { useI18n, type TranslationKey } from "../i18n";
import { Icon, type IconName } from "../components/Icon";
import { PageHeader } from "../components/ui";

interface MoreItem {
  to: string;
  label: TranslationKey;
  icon: IconName;
}

const TOOLS: MoreItem[] = [
  { to: "/transactions", label: "nav.transactions", icon: "list" },
  { to: "/budgets", label: "nav.budgets", icon: "target" },
  { to: "/categories", label: "nav.categories", icon: "tag" },
];

export function MorePage() {
  const { t } = useI18n();

  return (
    <div className="page-stack">
      <PageHeader title={t("more.title")} subtitle={t("more.subtitle")} />

      <section className="list-group">
        <h2 className="list-group-title">{t("more.tools")}</h2>
        {TOOLS.map((item) => (
          <Link key={item.to} to={item.to} className="list-row">
            <span className="list-row-icon">
              <Icon name={item.icon} />
            </span>
            <span className="list-row-main">{t(item.label)}</span>
            <Icon name="chevron-right" size={16} className="list-row-chevron" />
          </Link>
        ))}
      </section>

      <section className="list-group">
        <h2 className="list-group-title">{t("more.settings")}</h2>
        <Link to="/settings" className="list-row">
          <span className="list-row-icon">
            <Icon name="settings" />
          </span>
          <span className="list-row-main">{t("nav.settings")}</span>
          <Icon name="chevron-right" size={16} className="list-row-chevron" />
        </Link>
      </section>
    </div>
  );
}
