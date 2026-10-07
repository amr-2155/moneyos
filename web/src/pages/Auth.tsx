import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Input } from "../components/ui";
import { Icon } from "../components/Icon";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n, type TranslationKey } from "../i18n";

export type AuthMode = "login" | "signup" | "forgot" | "reset";

const TITLES: Record<AuthMode, { title: TranslationKey; subtitle: TranslationKey }> = {
  login: { title: "auth.loginTitle", subtitle: "auth.loginSubtitle" },
  signup: { title: "auth.signupTitle", subtitle: "auth.signupSubtitle" },
  forgot: { title: "auth.forgotPasswordTitle", subtitle: "auth.forgotPasswordSubtitle" },
  reset: { title: "auth.resetPasswordTitle", subtitle: "auth.resetPasswordSubtitle" },
};

/** Maps a thrown auth error to a translated, user-safe message. */
function useAuthError(): (error: unknown, mode: AuthMode) => string {
  const { t } = useI18n();
  return (error: unknown, mode: AuthMode): string => {
    if (error instanceof ApiError) {
      if (error.status === 0 || error.code === "NETWORK_ERROR") return t("auth.networkError");
      if (error.code === "RATE_LIMITED") return t("errors.rateLimited");
      if (error.code === "EMAIL_TAKEN") return t("auth.emailTaken");
      if (error.code === "INVALID_RESET_TOKEN" || error.status === 400) {
        return mode === "reset" ? t("auth.resetPasswordInvalid") : t("errors.generic");
      }
      if (error.status === 401) return t("auth.invalidCredentials");
    }
    return t("errors.generic");
  };
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, requestPasswordReset, resetPassword } = useAuth();
  const describeError = useAuthError();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const passwordId = useId();
  const token = searchParams.get("token");

  useEffect(() => {
    setError(null);
    setSent(false);
    setResetDone(false);
  }, [mode]);

  const heading = useMemo(() => TITLES[mode], [mode]);

  /** Validates locally before hitting the network. Returns an error key or null. */
  function validate(): string | null {
    if (mode !== "forgot" && mode !== "reset") {
      if (!email.trim()) return t("auth.email");
    }
    if (mode === "signup" || mode === "reset") {
      if (password.length < 8) return t("auth.passwordMin");
      if (password !== confirm) return t("auth.passwordsMismatch");
    }
    if (mode === "login" && !password) return t("auth.password");
    return null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const localError = validate();
    if (localError) {
      setError(localError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        navigate("/", { replace: true });
      } else if (mode === "signup") {
        await signUp(name.trim() || email.trim().split("@")[0]!, email.trim(), password);
        navigate("/", { replace: true });
      } else if (mode === "forgot") {
        const result = await requestPasswordReset(email.trim());
        setResetToken(result.resetToken ?? null);
        setSent(true);
      } else {
        if (!token) {
          setError(t("auth.resetPasswordInvalid"));
          return;
        }
        await resetPassword(token, password);
        setResetDone(true);
      }
    } catch (err) {
      setError(describeError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <aside className="auth-aside" aria-hidden>
        <div className="auth-aside-inner">
          <div className="auth-brand">
            <span className="brand-mark">
              <Icon name="star" size={16} />
            </span>
            <span>MoneyOS</span>
          </div>
          <h2>{t("auth.brandTagline")}</h2>
          <ul className="auth-points">
            <li>
              <Icon name="check" size={16} />
              {t("auth.brandPoint1")}
            </li>
            <li>
              <Icon name="check" size={16} />
              {t("auth.brandPoint2")}
            </li>
            <li>
              <Icon name="check" size={16} />
              {t("auth.brandPoint3")}
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-card-brand">
            <span className="brand-mark">
              <Icon name="star" size={16} />
            </span>
            MoneyOS
          </div>

          {resetDone ? (
            <div className="auth-success" role="status">
              <div className="auth-success-icon">
                <Icon name="check" />
              </div>
              <h1>{t("auth.resetPasswordSuccess")}</h1>
              <p className="muted">{t("auth.resetPasswordSuccessDesc")}</p>
              <Button variant="primary" block onClick={() => navigate("/login", { replace: true })}>
                {t("auth.signIn")}
              </Button>
            </div>
          ) : sent ? (
            <div className="auth-success" role="status">
              <div className="auth-success-icon">
                <Icon name="mail" />
              </div>
              <h1>{t("auth.forgotPasswordSent")}</h1>
              <p className="muted">{t("auth.forgotPasswordSentDesc")}</p>
              {resetToken ? (
                <>
                  <p className="muted small">{t("auth.devResetNotice")}</p>
                  <Button
                    variant="primary"
                    block
                    to={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                  >
                    {t("auth.openResetLink")}
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" block to="/login">
                {t("auth.forgotPasswordBack")}
              </Button>
            </div>
          ) : (
            <>
              <h1 className="auth-title">{t(heading.title)}</h1>
              <p className="auth-subtitle">{t(heading.subtitle)}</p>

              {error ? (
                <div className="auth-error" role="alert">
                  <Icon name="alert" size={16} />
                  <span>{error}</span>
                </div>
              ) : null}

              <form onSubmit={(e) => void onSubmit(e)} noValidate>
                {mode === "signup" ? (
                  <Field label={t("auth.name")}>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      autoFocus
                    />
                  </Field>
                ) : null}

                {mode !== "reset" ? (
                  <Field label={t("auth.email")}>
                    <Input
                      type="email"
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      inputMode="email"
                      required
                      autoFocus={mode !== "signup"}
                    />
                  </Field>
                ) : null}

                {mode !== "forgot" ? (
                  <Field
                    label={t("auth.password")}
                    hint={mode === "login" ? undefined : t("auth.passwordHint")}
                    affix={
                      <button
                        type="button"
                        className="input-affix-btn"
                        aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                      </button>
                    }
                  >
                    <Input
                      id={passwordId}
                      type={showPassword ? "text" : "password"}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      required
                    />
                  </Field>
                ) : null}

                {mode === "signup" || mode === "reset" ? (
                  <Field label={t("auth.confirmPassword")}>
                    <Input
                      type={showPassword ? "text" : "password"}
                      dir="ltr"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                ) : null}

                {mode === "login" ? (
                  <div className="auth-form-meta">
                    <Link to="/forgot-password" className="auth-link">
                      {t("auth.forgotPassword")}
                    </Link>
                  </div>
                ) : null}

                <Button type="submit" variant="primary" block size="lg" loading={busy}>
                  {busy
                    ? mode === "login"
                      ? t("auth.signingIn")
                      : t("auth.signingUp")
                    : mode === "login"
                      ? t("auth.signIn")
                      : mode === "signup"
                        ? t("auth.createAccount")
                        : mode === "forgot"
                          ? t("auth.forgotPasswordSend")
                          : t("auth.resetPasswordButton")}
                </Button>
              </form>

              <p className="auth-switch">
                {mode === "login" ? (
                  <>
                    {t("auth.noAccount")}{" "}
                    <Link to="/signup" className="auth-link">
                      {t("auth.createAccountLink")}
                    </Link>
                  </>
                ) : (
                  <>
                    {t("auth.hasAccount")}{" "}
                    <Link to="/login" className="auth-link">
                      {t("auth.signInLink")}
                    </Link>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
