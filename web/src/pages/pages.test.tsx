import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AppShell } from "../components/AppShell";
import { renderPage } from "../test/utils";
import { api, type AccountView, type BudgetView, type CategoryView, type DashboardView, type SavingsGoalView, type TransactionView, type TransferView } from "../lib/api";
import { AccountsPage } from "./Accounts";
import { AddPage } from "./Add";
import { BudgetsPage } from "./Budgets";
import { CategoriesPage } from "./Categories";
import { HomePage } from "./Home";
import { MorePage } from "./More";
import { ReportsPage } from "./Reports";
import { SavingsGoalsPage } from "./SavingsGoals";
import { SettingsPage } from "./Settings";
import { TransactionsPage } from "./Transactions";
import { TransfersPage } from "./Transfers";

vi.mock("../lib/api", () => {
  class ApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }

  const getAccessToken = (): string | null => localStorage.getItem("moneyos.accessToken");
  const getRefreshToken = (): string | null => localStorage.getItem("moneyos.refreshToken");
  const setTokens = (accessToken: string, refreshToken: string): void => {
    localStorage.setItem("moneyos.accessToken", accessToken);
    localStorage.setItem("moneyos.refreshToken", refreshToken);
  };
  const clearTokens = (): void => {
    localStorage.removeItem("moneyos.accessToken");
    localStorage.removeItem("moneyos.refreshToken");
  };

  const mockAccount: AccountView = {
    id: "a1",
    name: "Checking",
    type: "bank",
    currency: "USD",
    balance: "500.00",
    balanceMinor: 50000,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  const mockCategory: CategoryView = {    id: "food",
    name: "Food & Dining",
    type: "expense",
    parentId: null,
    icon: null,
    color: null,
    system: true,
    isArchived: false,
  };

  const mockTx: TransactionView = {
    id: "t1",
    type: "expense",
    amount: "10.00",
    amountMinor: 1000,
    currency: "USD",
    accountId: "a1",
    categoryId: "food",
    description: "Lunch",
    notes: null,
    date: "2026-08-10",
    transferId: null,
    reversalOfId: null,
    reversedAt: null,
    createdAt: "2026-08-10T00:00:00.000Z",
  };

  const mockGoal: SavingsGoalView = {
    id: "g1",
    name: "Emergency fund",
    targetAmount: "1000.00",
    targetAmountMinor: 100000,
    currentAmount: "250.00",
    currentMinor: 25000,
    currency: "USD",
    targetDate: null,
    description: null,
    progressPercent: 25,
    achieved: false,
    remainingAmount: "750.00",
    remainingMinor: 75000,
    isArchived: false,
    estimates: { requiredMonthly: null, requiredMonthlyMinor: null, completionMonth: null },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const mockBudget: BudgetView = {
    id: "b1",
    categoryId: "food",
    categoryName: "Food & Dining",
    icon: null,
    color: null,
    period: "2026-08",
    amount: "200.00",
    amountMinor: 20000,
    currency: "USD",
    spent: "50.00",
    spentMinor: 5000,
    remaining: "150.00",
    remainingMinor: 15000,
    percentUsed: 25,
    status: "normal",
    warningThresholdPercent: 75,
    isArchived: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const mockTransfer: TransferView = {
    id: "tr1",
    fromAccountId: "a1",
    toAccountId: "a2",
    amount: "100.00",
    amountMinor: 10000,
    currency: "USD",
    notes: null,
    date: "2026-08-05",
    reversedAt: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    legs: [
      { ...mockTx, id: "leg1", accountId: "a1", description: "Checking", type: "transfer", amountMinor: 10000, amount: "100.00", transferId: "tr1" },
      { ...mockTx, id: "leg2", accountId: "a2", description: "Savings", type: "transfer", amountMinor: 10000, amount: "100.00", transferId: "tr1" },
    ],
  };

  const mockDashboard: DashboardView = {
    month: "2026-08",
    currency: "ALL",
    balances: [{ currency: "USD", amountMinor: 50000 }],
    totalBalanceMinor: 50000,
    monthSummary: { incomeMinor: 50000, expensesMinor: 30000, savingsMinor: 20000, savingsRatePercent: 40 },
    spendingByCategory: [
      { categoryId: "c1", categoryName: "Food", icon: null, color: null, amountMinor: 15000, percentOfTotal: 50 },
      { categoryId: "c2", categoryName: "Transport", icon: null, color: null, amountMinor: 10000, percentOfTotal: 33 },
    ],
    trend: [{ month: "2026-08", incomeMinor: 50000, expensesMinor: 30000 }],
    recentTransactions: [],
    accountBalances: [{ accountId: "a1", name: "Checking", currency: "USD", balanceMinor: 50000 }],
  };

  const api = {
    auth: { signup: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn(), updateMe: vi.fn() },
    accounts: { list: vi.fn(async () => [mockAccount]), create: vi.fn(), update: vi.fn(), archive: vi.fn(), activate: vi.fn() },
    categories: {
      list: vi.fn(async () => [mockCategory]),
      create: vi.fn(async (body: { name: string; type: string }) => ({
        id: "new",
        name: body.name,
        type: body.type,
        parentId: null,
        icon: null,
        color: null,
        system: false,
        isArchived: false,
      })),
      update: vi.fn(),
      archive: vi.fn(),
    },
    transactions: {
      list: vi.fn(async () => ({ data: [mockTx], meta: { page: 1, limit: 30, total: 1 } })),
      create: vi.fn(),
      reverse: vi.fn(),
    },
    transfers: {
      list: vi.fn(async () => ({ data: [mockTransfer], meta: { page: 1, limit: 30, total: 1 } })),
      create: vi.fn(),
      reverse: vi.fn(),
    },
    dashboard: { get: vi.fn(async () => mockDashboard) },
    budgets: { list: vi.fn(async () => [mockBudget]), create: vi.fn(), update: vi.fn(), archive: vi.fn() },
    savingsGoals: {
      list: vi.fn(async () => [mockGoal]),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      contributions: { list: vi.fn(), add: vi.fn() },
    },
  };

  return { ApiError, api, getAccessToken, getRefreshToken, setTokens, clearTokens };
});

vi.mock("../lib/analyticsApi", () => {
  const mockOverview = {
    query: {},
    months: [
      { month: "2026-08", currency: "USD", incomeMinor: 50000, expensesMinor: -30000, savingsMinor: 20000, savingsRatePercent: 40 },
      { month: "2026-08", currency: "EGP", incomeMinor: 50000, expensesMinor: -30000, savingsMinor: 20000, savingsRatePercent: 40 },
    ],
    spendingByCategory: [
      { categoryId: "c1", categoryName: "Food", currency: "EGP", totalMinor: 15000, percentOfTotal: 50 },
      { categoryId: "c2", categoryName: "Transport", currency: "EGP", totalMinor: 10000, percentOfTotal: 33 },
    ],
    netWorthTrend: [
      { month: "2026-08", currency: "USD", totalMinor: 50000 },
      { month: "2026-08", currency: "EGP", totalMinor: 50000 },
    ],
  };

  const mockGoal = {
    id: "g1",
    name: "Emergency fund",
    targetAmountMinor: 100000,
    currentMinor: 25000,
    currency: "EGP",
    targetDate: null,
    progressPercent: 25,
    achieved: false,
    remainingMinor: 75000,
    isArchived: false,
  };

  const mockBudget = {
    id: "b1",
    categoryId: "cat1",
    categoryName: "Food & Dining",
    period: "2026-08",
    amountMinor: 20000,
    currency: "EGP",
    spentMinor: 5000,
    remainingMinor: 15000,
    percentUsed: 25,
    status: "normal",
    warningThresholdPercent: 75,
    isArchived: false,
  };

  const mockComparison = [
    {
      from: "2026-07",
      to: "2026-08",
      currency: "USD",
      currentIncomeMinor: 50000,
      currentExpensesMinor: -30000,
      previousIncomeMinor: 20000,
      previousExpensesMinor: -16000,
      incomeChangePercent: 150,
      expensesChangePercent: -50,
    },
    {
      from: "2026-07",
      to: "2026-08",
      currency: "EGP",
      currentIncomeMinor: 50000,
      currentExpensesMinor: -30000,
      previousIncomeMinor: 20000,
      previousExpensesMinor: -16000,
      incomeChangePercent: 150,
      expensesChangePercent: -50,
    },
  ];

  const HttpError = class HttpError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code: string,
    ) {
      super(message);
      this.name = "HttpError";
    }
  };

  const analyticsApi = {
    overview: vi.fn(async () => mockOverview),
    monthlySummary: vi.fn(async () => mockOverview.months),
    categoryBreakdown: vi.fn(async () => mockOverview.spendingByCategory),
    incomeExpenseTrend: vi.fn(async () => mockOverview.months),
    periodComparison: vi.fn(async () => mockComparison),
    netWorthTrend: vi.fn(async () => mockOverview.netWorthTrend),
    budgetPerformance: vi.fn(async () => [mockBudget]),
    savingsGoalProgress: vi.fn(async () => [mockGoal]),
  };

  return { analyticsApi, HttpError };
});

describe("pages", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the home dashboard with the month status", async () => {
    renderPage(<HomePage />);
    expect(await screen.findByRole("heading", { name: /Hello/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Now")).toBeInTheDocument();
    expect(screen.getByText("Your money in Aug 2026")).toBeInTheDocument();
    expect(screen.getAllByText("500.00 EGP").length).toBeGreaterThan(0);
    expect(screen.getByText("Emergency fund")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  it("shows the quotes card and cycles it with the single next button", async () => {
    renderPage(<HomePage />);
    const card = await screen.findByLabelText("A word of wisdom");
    expect(card).toBeInTheDocument();
    expect(screen.queryByLabelText("Previous")).not.toBeInTheDocument();
    const quoteText = () => card.querySelector("blockquote")!.textContent!;
    const before = quoteText();
    fireEvent.click(screen.getByLabelText("Next"));
    await waitFor(() => expect(quoteText()).not.toBe(before));
  });

  it("renders the add page: type switch, big amount and category picker", async () => {
    renderPage(<AddPage />);
    expect(await screen.findByRole("heading", { name: "Add a transaction" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Expense" })).toHaveAttribute("aria-selected", "true");
    const amount = screen.getByRole("textbox", { name: "Amount" });
    fireEvent.change(amount, { target: { value: "1500" } });
    expect(amount).toHaveValue("1,500");
    expect(screen.getByRole("button", { name: "+100" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Choose a category/ }));
    expect(await screen.findByRole("button", { name: /Food & Dining/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add category" })).toBeInTheDocument();
  });

  it("saves a transaction with the chosen category", async () => {
    renderPage(<AddPage />);
    await screen.findByRole("heading", { name: "Add a transaction" });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), { target: { value: "250.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Choose a category/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Food & Dining/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() => expect(api.transactions.create).toHaveBeenCalled());
    expect(api.transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: "expense", amount: "250.5", categoryId: "food", date: expect.any(String) }),
    );
  });

  it("preselects the income type when coming from the income CTA", async () => {
    renderPage(<AddPage />, { route: "/add?type=income" });
    await screen.findByRole("heading", { name: "Add a transaction" });
    expect(screen.getByRole("tab", { name: "Income" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
  });

  it("creates a new category inline and selects it", async () => {
    renderPage(<AddPage />);
    await screen.findByRole("heading", { name: "Add a transaction" });
    fireEvent.click(screen.getByRole("button", { name: /Choose a category/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add category" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Category name" }), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(api.categories.create).toHaveBeenCalledWith({ name: "Coffee", type: "expense" }));
    expect(await screen.findByRole("button", { name: /Coffee/ })).toBeInTheDocument();
  });

  it("shows the note field only after tapping add note", async () => {
    renderPage(<AddPage />);
    await screen.findByRole("heading", { name: "Add a transaction" });
    expect(screen.getByRole("button", { name: "Add a note" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toBeInTheDocument();
  });

  it("renders the reports page with the month summary", async () => {
    renderPage(<ReportsPage />);
    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getAllByText("Income").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Expenses").length).toBeGreaterThan(0);
  });

  it("renders the transactions page with grouped items", async () => {
    renderPage(<TransactionsPage />);
    expect(await screen.findByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(await screen.findByText("Lunch")).toBeInTheDocument();
  });

  it("renders the accounts page with account cards", async () => {
    renderPage(<AccountsPage />);
    expect(await screen.findByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    expect(await screen.findByText("Checking")).toBeInTheDocument();
    expect(await screen.findByText("$500.00")).toBeInTheDocument();
  });

  it("renders the budgets page with budget rows", async () => {
    renderPage(<BudgetsPage />);
    expect(await screen.findByRole("heading", { name: "Budgets" })).toBeInTheDocument();
    expect(await screen.findByText("Food & Dining")).toBeInTheDocument();
    expect(await screen.findByText("On track")).toBeInTheDocument();
  });

  it("renders the savings goals page with goal cards", async () => {
    renderPage(<SavingsGoalsPage />);
    expect(await screen.findByRole("heading", { name: "Goals" })).toBeInTheDocument();
    expect(await screen.findByText("Emergency fund")).toBeInTheDocument();
  });

  it("renders the transfers page with transfer items", async () => {
    renderPage(<TransfersPage />);
    expect(await screen.findByRole("heading", { name: "Transfers" })).toBeInTheDocument();
    expect(await screen.findByText("Checking → Savings")).toBeInTheDocument();
  });

  it("renders the settings page", async () => {
    renderPage(<SettingsPage />);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export backup/ })).toBeInTheDocument();
  });

  it("renders the more page with links to secondary tools", async () => {
    renderPage(<MorePage />);
    expect(await screen.findByRole("heading", { name: "More" })).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    expect(screen.getByText("Accounts")).toBeInTheDocument();
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
  });

  it("renders the app shell with navigation and brand", async () => {
    renderPage(
      <AppShell>
        <div>child content</div>
      </AppShell>,
    );
    expect(screen.getAllByText("MoneyOS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Add").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reports").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Goals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("More").length).toBeGreaterThan(0);
    expect(screen.getByText("child content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("shows the empty state when there are no accounts", async () => {
    vi.mocked(api.accounts.list).mockResolvedValueOnce([]);
    renderPage(<AccountsPage />);
    expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
  });

  it("renders the categories page grouped by type", async () => {
    renderPage(<CategoriesPage />);
    expect(await screen.findByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByText("Food & Dining")).toBeInTheDocument();
    expect(screen.getByText("Income")).toBeInTheDocument();
    expect(screen.getByText("Expense")).toBeInTheDocument();
  });

  it("creates a new category from the form", async () => {
    renderPage(<CategoriesPage />);
    await screen.findByRole("heading", { name: "Categories" });
    fireEvent.click(screen.getByRole("button", { name: "New category" }));
    fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Cinema" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.categories.create).toHaveBeenCalledWith({ name: "Cinema", type: "expense" }));
  });
});
