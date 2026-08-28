# MoneyOS — Product Requirements Document (PRD)

- Status: Draft v0.1
- Date: 2026-08-13
- Repository root: `moneyos/`

## 1. Product Vision

MoneyOS is an open-source personal finance platform that lets a user understand, from one
place:

- How much money they have.
- Where their money is (accounts).
- Where their money goes (expenses by category).
- How much they earn (income).
- How much they save and at what rate.
- How much they invest and how investments perform.
- How profitable their business projects are.
- How much they donate.
- How their net worth changes over time.

The product must eventually answer questions such as:

- "Where did my money go this month?"
- "What are my largest expenses?"
- "How much can I safely spend?"
- "Am I spending more than usual?"
- "How long until I reach my savings goal?"
- "What is my current net worth?"
- "Which income source is most profitable?"

## 2. Goals & Non-Goals

### Goals (MVP)

- Record income and expenses quickly (few taps).
- Manage multiple accounts and transfers between them.
- Hierarchical, user-extensible categories.
- Monthly budgets with progress and warnings.
- Savings goals with progress and estimates.
- A clean dashboard and basic analytics.
- Net worth tracking.
- Privacy and data integrity as first-class concerns.

### Non-Goals (MVP)

- Real-time market data / investment performance (future module).
- Bank/account aggregation or open-banking integrations (future).
- Multi-user / family sharing (out of scope).
- AI-generated insights (future, read-only layer).
- Currency conversion service (future; conversion is never done silently).

## 3. Core Principles

1. **Financial correctness** — no floating-point for money; integer minor units in storage
   and calculations; auditable transaction history.
2. **Data integrity** — historical records are immutable; corrections are explicit
   (reversals/adjustments), never silent mutations.
3. **Modular architecture** — each domain (accounts, transactions, budgets, …) is an
   independent, extensible module.
4. **Privacy first** — financial data is sensitive; least-exposure logging, secure auth,
   strict per-user ownership; never another user's data.
5. **UX first** — fast transaction entry, dashboard that informs without overwhelming,
   mobile-friendly.

## 4. Users & Roles

Single-role application: an authenticated **user** owns all of their records. No
cross-user access is possible at the database or API layer. The schema carries
`userId` ownership on every user-owned entity, and every service/query scopes by the
authenticated user — client-supplied identity is never trusted.

## 5. Functional Requirements

### 5.1 Authentication (Phase 1 — implemented)

- Sign up (email + password + name).
- Login / logout.
- Access token (short-lived JWT) + rotating refresh token (hashed in DB).
- Password reset via time-limited token (provider-abstracted mailer; console mailer in dev).
- User profile: read and update (name, default currency, locale).

### 5.2 Accounts (implemented)

An account is a place where money exists: cash, bank, mobile wallet, credit card,
savings, investment account, other. Fields: name, type, currency, opening balance,
current balance, active/inactive. Account types are extensible. API:
`GET/POST /accounts`, `GET/PATCH /accounts/:id`, `POST /accounts/:id/archive|activate`.

### 5.3 Categories (implemented)

User-extensible, with a type (`income` / `expense`). System categories (e.g. salary,
food) are seeded as data, never hard-coded in logic. API:
`GET/POST /categories`, `PATCH /categories/:id`, `POST /categories/:id/archive`.

### 5.4 Transactions (implemented)

Types: `income`, `expense`, `transfer`. Transfers are not income/expense — they create
two linked movements (A −1000, B +1000, net 0). Records are immutable; corrections use
explicit reversals (`POST /transactions/:id/reverse`, `POST /transfers/:id/reverse`).

### 5.5 Dashboard (implemented)

`GET /dashboard?month=&currency=` returns: total balance per currency plus a total in the
selected currency, monthly income/expenses/savings, savings rate (null-safe when income
= 0), recent transactions, expense breakdown by category with share %, a 6-month
income-vs-expense trend, and per-account balances. All aggregates are computed
backend-side in a single user-selected currency — different currencies are reported
separately, never silently combined.

### 5.6 Budgets (implemented)

Monthly budget per category (`GET/POST /budgets`, `PATCH`, `POST /budgets/:id/archive`).
The API derives live spent/remaining/% used from transactions and returns a status
(`normal` / `approaching` / `exceeded`) using a per-budget configurable warning threshold
(default 80%) — thresholds are not hard-coded in the UI. Budgets are currency-aware.

### 5.7 Savings Goals (implemented)

`GET/POST /savings-goals`, `PATCH`, archive, and contribution endpoints. Target amount,
starting balance, target date, description, progress %, remaining, contribution history,
required monthly saving, and projected completion month. Estimates are labeled as
estimates, never guaranteed. Goal currency is locked once contributions exist.

### 5.8 Analytics (Phase 7)

Reusable, UI-agnostic analytics services: income/expenses/savings by month, savings
rate, expenses by category, top spending categories, spending comparison vs previous
period, account balances, net worth trend.

### 5.9 Future modules

- Investments (stocks, ETFs, funds, gold, crypto, other) with cost basis, market value,
  realized/unrealized P&L. Market data isolated behind provider interfaces; no real-time
  assumption.
- Business projects: revenue, costs, profit, margin, history.
- Charity: donations with purpose/recipient, monthly/yearly totals.
- Financial intelligence: read-only, clearly separating facts / estimates / recommendations.

### 5.10 Frontend (implemented)

React + Vite SPA in `web/`. Pages: dashboard, budgets, savings goals, accounts,
transactions, transfers, plus login/signup. Mobile-first; bottom navigation on small
screens. All financial values come pre-computed from the API — the UI only formats them
(no financial calculations duplicated client-side) and reports multi-currency amounts
per currency without summing across them.

## 6. Non-Functional Requirements

| Area | Requirement |
| --- | --- |
| Money | Integer minor units; explicit currency; no silent conversion |
| Database | Relational (SQLite for dev/tests, portable schema); normalized; ownership on every table |
| API | REST-ish; consistent validation, auth, errors, pagination, filtering, sorting |
| Security | Hashed passwords (bcrypt), JWT + rotating refresh tokens, rate limiting, CORS allow-list, helmet, env-based config, no stack traces to clients |
| Testing | Unit tests for business logic; integration tests for critical API/DB behavior; financial edge cases covered |
| UX | Clean, modern, responsive, accessible, mobile-friendly, fast; minimal-step transaction entry |
| Quality | Definition of Done (below) enforced per feature |

## 7. Definition of Done

A feature is complete only when:

- Database changes exist and migrations run.
- API works with validation and authorization.
- UI exists when applicable, with loading, empty, and error states.
- Tests exist and pass.
- Lint and type checks pass.
- Documentation is updated.
- No obvious security issue remains.

## 8. Success Metrics

- Transaction recorded in ≤ 7 seconds.
- Time-to-value (first transaction recorded) under 2 minutes from signup.
- Zero reported money-calculation bugs in release.
- Mobile-friendly score passes on common tooling.

## 9. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Money precision bugs | Integer minor units + unit tests for all financial math |
| Data loss on "edits" | Immutable transactions + explicit reversal model |
| Scope creep | Strict MVP phase order; future modules behind planned interfaces |
| Cost of running DB/market data | SQLite local-first; provider abstraction for market data |
