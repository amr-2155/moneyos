import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./lib/auth";
import { AccountsPage } from "./pages/Accounts";
import { AddPage } from "./pages/Add";
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
  return <div className="loading-screen">MoneyOS</div>;
}

export function App() {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
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
        <Route path="/savings" element={<Navigate to="/goals" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
