import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { AccountsPage } from "./pages/Accounts";
import { AddPage } from "./pages/Add";
import { AuthPage } from "./pages/Auth";
import { BudgetsPage } from "./pages/Budgets";
import { CategoriesPage } from "./pages/Categories";
import { HomePage } from "./pages/Home";
import { MorePage } from "./pages/More";
import { ReportsPage } from "./pages/Reports";
import { SavingsGoalsPage } from "./pages/SavingsGoals";
import { SettingsPage } from "./pages/Settings";
import { TransactionsPage } from "./pages/Transactions";
import { TransfersPage } from "./pages/Transfers";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <span className="loading-brand">
        <span className="brand-mark" />
        MoneyOS
      </span>
      <span className="loading-bar" aria-hidden />
    </div>
  );
}

/** Sign-in / sign-up / password-reset entry point (no app chrome). */
function AuthRoutes() {
  return (
    <Routes>
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="*" element={<AuthPage mode="login" />} />
    </Routes>
  );
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  // Nothing on this device is usable without a signed-in user: MoneyOS keeps
  // every financial record scoped to the account that created it.
  if (!user) {
    return <AuthRoutes />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/add" element={<AddPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/goals" element={<SavingsGoalsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/savings" element={<Navigate to="/goals" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
