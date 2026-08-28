# MoneyOS — Roadmap

- Status: Draft v0.1
- Date: 2026-08-13

> Milestones are ordered by value and dependency. Each milestone ends green:
> typecheck + lint + tests + docs updated (see Definition of Done in `PRD.md`).

## Phase 0 — Foundation (DONE)

- [x] Project scaffold: TypeScript (strict, ESM), Fastify 5, Drizzle + SQLite, Vitest, ESLint, Prettier
- [x] Env config with Zod validation
- [x] App/error conventions, money utilities (integer minor units) + tests
- [x] Full core schema designed (users, sessions, accounts, categories, transactions, transfers, budgets, savings_goals)
- [x] First migration applied
- [x] `GET /health`
- [x] Documentation: PRD, ARCHITECTURE, DATABASE, ROADMAP
- [x] `npm run check` green

## Phase 1 — Authentication (DONE)

- [x] Sign up / login / logout
- [x] JWT access token + rotating hashed refresh token (multi-device sessions)
- [x] Password reset (token + console mailer via `Mailer` interface)
- [x] Profile read/update (`GET`/`PATCH /auth/me`)
- [x] Rate limiting, helmet, CORS allow-list
- [x] Integration tests + unit tests

## Phase 2 — Accounts & Categories (DONE)

- [x] Accounts CRUD + balance management (opening/current balance, soft deletes)
- [x] Category CRUD + hierarchy + system categories
- [x] Ownership/validation tests; balance update rules

## Phase 3 — Transactions (DONE)

- [x] Create income / expense
- [x] Transfers as linked legs (`transaction_transfers`), net-zero, excluded from income/expense
- [x] Immutability: explicit reversal mechanism
- [x] List with sorting and pagination (`{ data, meta }` envelope)
- [x] Financial correctness tests (income totals, expense totals, transfers, balances)

## Phase 4 — Dashboard (DONE)

- [x] Total balance per currency + total in a selected currency
- [x] Monthly income / expenses / savings + savings rate (zero-income safe)
- [x] Recent transactions, expense breakdown by category (with share %)
- [x] Monthly trend (income vs expenses, last 6 months)
- [x] All aggregates computed backend-side (`GET /dashboard`) — never in the UI
- [x] UI: cards, category breakdown, trend chart, empty/loading/error states

## Phase 5 — Budgets (DONE)

- [x] Monthly budgets per category (spent / remaining / % used), currency-aware
- [x] Live spending derived from transactions; configurable warning thresholds
- [x] Status computed backend-side: `normal` / `approaching` / `exceeded`
- [x] UI: budget cards with progress + status; create/edit/archive

## Phase 6 — Savings Goals (DONE)

- [x] Goals CRUD, progress %, remaining, contribution history
- [x] Required monthly saving + estimated completion month — labeled as estimates
- [x] Savings math tests (edge cases: zero savings, no target date, achieved goals)
- [x] UI: goal cards, add-contribution flow, contribution history

## Phase 6.5 — Frontend (DONE)

- [x] React + Vite SPA in `web/` (auth, dashboard, budgets, savings, accounts, transactions, transfers)
- [x] Mobile-first responsive layout, bottom navigation on small screens
- [x] Typed API client via Vite dev proxy (`/api` → Fastify :3001); no CORS
- [x] Frontend build + typecheck green; no financial math duplicated client-side

## Phase 7 — Analytics

- [ ] Reusable UI-agnostic analytics services (income/expenses/savings by month,
      savings rate, category aggregation, top categories, period comparison,
      net-worth trend)
- [ ] `GET /analytics/overview` and related endpoints
- [ ] Analytics unit tests

## Phase 8 — MVP Hardening & Release

- [ ] Full test suite green; security review (auth, ownership, rate limits, secrets)
- [ ] UX review: transaction entry ≤ 7s, mobile-first, loading/empty/error states
- [ ] Seed script for default categories + demo data (optional)
- [ ] Production config (Postgres option), `Dockerfile`/compose, README, LICENSE, CI
- [ ] Tag MVP release

## Future Modules (architecture prepared, not MVP)

- **Investments** — asset types, cost basis, market value, realized/unrealized P&L;
  market data behind provider interfaces (no real-time assumption).
- **Projects (profit/business)** — revenue, costs, profit, margin, history.
- **Charity** — donations with purpose/recipient; monthly/yearly aggregates.
- **Financial intelligence (AI, read-only)** — insights layer clearly separating
  facts / estimates / recommendations; never auto-executes financial actions.
- **Currency conversion service** — explicit, never silent.
- **Notifications** — budget/goal alerts.
