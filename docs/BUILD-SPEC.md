# Money Tracker — Build Spec (for Claude Code)

> A free, open-source, **local-first PWA** personal finance tracker. Open it → see all your accounts and net worth → track goals → set category budgets. Manual entry plus statement import. No server, no account, no subscription. Built for one user (you), shipped open-source.
>
> **This is the master spec. Build it phase by phase. Each phase has a Definition of Done (DoD) — that's the acceptance test before moving on.** Supersedes the earlier draft plan; positioning rationale lives in `money-tracker-oss-research-and-plan.md`.

---

## 0. Principles (don't drift from these)

- **Personal, single-user.** No login, no multi-tenant, no backend in v1.
- **Local-first.** All data in the browser (IndexedDB). Works fully offline. Nothing leaves the device unless the user exports it.
- **Correctness first.** Balances are derived from a pure, unit-tested engine. Editing history must never corrupt a balance (this is the #1 bug in competitors).
- **Free & open-source (MIT).** No ads, no tiers.
- **Simple beats complete.** Do the important things well.

---

## 1. Stack (locked)

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript |
| Styling | Tailwind CSS + Headless UI |
| Local DB | IndexedDB via **Dexie.js** + `dexie-react-hooks` (`useLiveQuery`) |
| PWA/offline | `vite-plugin-pwa` (Workbox) |
| Charts | Recharts |
| Routing | React Router |
| Spreadsheet/PDF import | SheetJS (`xlsx`) for CSV/Excel; `pdfjs-dist` for PDF text extraction |
| Money | Integer **minor units** (centavos). Format with `Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' })` |
| Tests | Vitest (unit) for the money/balance/budget/goal math |

---

## 2. Data model

Amounts are signed integers in **minor units** (₱1,234.50 → `123450`). Expenses negative, income positive. Every record has `createdAt` and `updatedAt` (epoch ms) so future sync has something to diff.

```ts
interface Account {
  id: string;
  name: string;                 // "GCash", "Maya", "Maribank", "AUB HelloMoney"
  bank: string;                 // grouping label (often same as name)
  type: 'ewallet' | 'savings' | 'checking' | 'credit' | 'cash' | 'investment';
  currency: string;             // default "PHP"
  openingBalance: number;       // minor units; balance = opening + Σ txns
  isIncomeSource?: boolean;     // e.g. AUB HelloMoney (salary lands here)
  color?: string; icon?: string;
  archived: boolean; sortOrder: number;
  createdAt: number; updatedAt: number;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;               // signed minor units (+income / -expense)
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  categoryId?: string;
  transferAccountId?: string;   // the other account when type==='transfer'
  transferGroupId?: string;     // links the two legs of a transfer
  goalId?: string;              // if this txn is a contribution to a goal
  date: number;                 // epoch ms (day it happened)
  note?: string;
  importBatchId?: string;       // set when created via import (for undo/dedup)
  importHash?: string;          // dedup key: account+date+amount+ref
  createdAt: number; updatedAt: number;
}

interface Category {
  id: string; name: string;     // "Groceries", "Bills", "Transport", "Salary"...
  kind: 'income' | 'expense';
  color: string; icon?: string;
}

interface Budget {
  id: string;
  categoryId: string;
  amount: number;               // monthly limit, minor units
  period: 'monthly';            // v1 = monthly only
  rollover?: boolean;           // carry unspent to next month (optional)
  createdAt: number; updatedAt: number;
}

interface Goal {
  id: string;
  name: string;                 // "Emergency fund", "New phone", "Japan trip"
  targetAmount: number;         // minor units
  targetDate?: number;
  linkedAccountId?: string;     // optional: track against an account's balance
  color?: string; icon?: string;
  archived: boolean;
  createdAt: number; updatedAt: number;
}

interface Settings {
  id: 'singleton';
  baseCurrency: string;         // "PHP"
  theme: 'system' | 'light' | 'dark';
  lastBackupAt?: number;
}
```

### Derived math (pure module `lib/balances.ts`, unit-tested)
- **Account balance** = `openingBalance + Σ(txn.amount for that account)`.
- **Adjustment**: user enters their real balance → create an `adjustment` txn = `real − computed`. Reconciles without editing history.
- **Transfer** = two linked txns (`−` from source, `+` to dest) sharing `transferGroupId`; excluded from income/expense and from budgets.
- **Net worth** = `Σ balances` (credit/loan accounts are negative).
- **Budget spent** (for a month) = `Σ |expense txns| in that category that month`, excluding transfers/adjustments. Remaining = `limit − spent` (+ rollover if enabled).
- **Goal progress** = linked account balance, OR `Σ txns where goalId == goal.id`. Percent = `saved / targetAmount`.

> Round every displayed number via the formatter. Never show raw float math.

### Seed data (first launch)
- Accounts: **GCash** (ewallet), **Maya** (ewallet), **Maribank** (savings), **AUB HelloMoney** (savings, `isIncomeSource: true`). All `currency: "PHP"`, `openingBalance: 0` (user sets real balances on first run).
- Categories (expense): Groceries, Food, Transport, Bills, Shopping, Health, Fun, Other. (income): Salary, Freelance, Other.
- Settings: `baseCurrency: "PHP"`, `theme: "system"`.

---

## 3. Screens

1. **Dashboard** — net worth total (assets vs. liabilities) + account cards grouped by bank (your 4). Mini net-worth trend. FAB "+". Quick glance at budget status + top goal.
2. **Account detail** — balance, "Adjust balance", that account's transactions, edit/archive.
3. **Add/Edit transaction** — amount, type (income/expense/transfer), category, account, date, note; transfer mode shows second account; optional "contribute to goal".
4. **Activity** — all transactions grouped by date; filter by account/category/type; search; bulk re-categorize.
5. **Budgets** — list of category budgets with progress bars (spent/limit), over-budget in red, add/edit budgets. "Set a budget for X" in two taps.
6. **Goals** — goal cards with progress rings (saved/target, ETA vs. targetDate), add/edit, contribute.
7. **Insights** — spending by category (donut, period selectable), net worth over time (line), budget overview, income vs. expense per month.
8. **Import** — import statements (see §4).
9. **Settings** — base currency, theme, manage accounts & categories, **Export/Import backup (JSON)**, last-backup time, About/OSS/license.

UX musts: mobile-first single column, thumb-reachable FAB, empty/loading/error states, dark mode, ₱ formatting everywhere.

---

## 4. Statement import (manual + import = the v1 data strategy)

None of the target apps expose a personal API; all expose **exportable statements**. Import is therefore the friction-reducer.

What each account gives you:

| Account | Export path | Format to support |
|---|---|---|
| **GCash** | App → Transactions → "Request transaction history" → emailed | **PDF** (password = surname + last 4 of number). Business → CSV. Community PDF→CSV converters exist. |
| **Maya** | App → Transaction History → export | **PDF / Excel (xlsx)** |
| **Maribank PH** | Monthly e-statement / in-app history | **PDF** |
| **AUB HelloMoney** | In-app history; SOA via customercare@aub.com.ph | In-app (manual) / **PDF** |

**Build import in two stages:**

**Stage A — CSV/Excel importer with column mapping (do first; highest value/effort ratio).**
- User uploads `.csv`/`.xlsx` (SheetJS). Show a mapping step: pick which columns are *date*, *amount*, *description*, and (optional) *type*. Remember mappings per account.
- Parse → preview table → user assigns target account + categories → commit.
- Handles Maya Excel, GCash-business CSV, and any GCash PDF the user converted to CSV.

**Stage B — PDF importer with per-bank parser profiles (enhancement).**
- Extract text with `pdfjs-dist`; support **password-protected PDFs** (GCash) by prompting for the password.
- Per-bank parser profiles (regex/line rules): start with **GCash** and **Maya**, then **Maribank**, then **AUB**. Each profile maps lines → {date, amount, sign, description}.
- Same preview → categorize → commit flow as Stage A.

**Shared import rules:**
- **Dedup** via `importHash` = hash(accountId + date + amount + normalizedDescription). Skip/flag duplicates.
- Group each import under an `importBatchId` so the whole batch can be **undone**.
- Never auto-commit — always show a review screen first.
- Imported expenses feed budgets automatically; transfers detected (same amount in/out close in time) can be suggested as transfers.

> Out of scope for v1 (note for later): Android notification/SMS auto-capture (needs a Capacitor native build + notification-listener, Android-only) and aggregator APIs (Brankas/Finverse are B2B). Keep the data layer import-friendly so these can plug in later.

---

## 5. Build phases (give Claude Code one at a time)

**P0 — Scaffold & PWA.** Vite+React+TS, Tailwind+Headless UI, Router, Dexie+hooks, Recharts, vite-plugin-pwa, SheetJS, pdfjs-dist. Bottom-nav shell, manifest, icons.
*DoD:* runs, builds clean, installable on phone, **loads with network off**.

**P1 — Data layer + engine.** All Dexie tables (incl. Budget, Goal), seed accounts/categories on first run, `money.ts` + `balances.ts` with **Vitest tests** (balance, adjustment, transfer, net worth, budget-spent, goal-progress).
*DoD:* tests pass; `useLiveQuery` re-renders on writes.

**P2 — Accounts & Dashboard.** CRUD accounts (your 4 seeded), dashboard cards grouped by bank + net-worth total (assets vs liabilities), ₱ formatting.
*DoD:* editing an account instantly updates cards + total; income-source flag visible.

**P3 — Transactions.** Add/edit/delete income & expense; account detail list; adjust-balance; transfers as linked pairs; Activity screen with filters/search + bulk re-categorize.
*DoD:* balance always == opening + Σ txns; transfers don't count as spending; deleting a transfer removes both legs.

**P4 — Budgets.** Monthly category budgets, progress bars, over-budget styling, optional rollover.
*DoD:* spending updates budget progress live; transfers/adjustments excluded; a hand-checked month matches.

**P5 — Goals.** Goal cards with progress, target date/ETA, contribute (manual or linked account).
*DoD:* contributions move progress correctly; linked-account goals reflect balance.

**P6 — Insights.** Spending-by-category donut (period selector), net-worth-over-time line, budget overview, income vs expense.
*DoD:* charts match underlying numbers for a sample month.

**P7 — Statement import.** Stage A (CSV/Excel + mapping + preview + dedup + undo), then Stage B (PDF: GCash w/ password, Maya, then Maribank/AUB).
*DoD:* importing a real GCash/Maya statement creates correct, de-duplicated transactions after review; re-importing the same file adds nothing.

**P8 — Polish & backup.** Empty/loading/error states, dark mode, install prompt, **JSON export/import**, backup reminder, accessibility pass.
*DoD:* export → clear data → import restores everything exactly; pleasant on a real phone.

**P9 — Repo & release.** See §6.
*DoD:* public repo with README + demo link; downloadable release that runs locally.

**Later (optional):** Capacitor Android build for notification auto-capture; Tauri desktop; opt-in cloud sync (Dexie Cloud/Supabase).

---

## 6. Repo, distribution & launch

**License:** MIT (`LICENSE` file). Free, max adoption, contributor-friendly.

**Repo (public GitHub):** `README` (what/why + screenshots + live demo link + "run locally"), `LICENSE`, `CONTRIBUTING.md`, issue/PR templates, `ROADMAP.md`, screenshots in `/docs`.

**Hosting (free, no backend):** GitHub Pages / Cloudflare Pages / Netlify / Vercel. Push → static PWA at a URL → users "Add to Home Screen" → offline.

**Run locally / download:**
- Hosted URL is the easy path (it's local after first load).
- `dist.zip` in GitHub Releases; run with `npx serve` or `python -m http.server` (note: service workers need http(s), not `file://`).
- Devs: `git clone` → `npm install` → `npm run dev`.

**Data ownership:** IndexedDB on device; JSON + CSV export/import; no account, no telemetry. This is the "can't be shut down" promise — say it in the README.

**LinkedIn launch checklist (low-pressure):**
- Repo + live demo ready; 3–5 screenshots; a 30–60s screen-recording GIF.
- One post: the story ("I got tired of juggling GCash/Maya/Maribank/AUB, so I built a free, open-source, offline tracker — here's the repo + demo"). Lead with the *free + open-source + on-device* angle.
- Cross-post to a PH personal-finance group/Threads and r/selfhosted / r/opensource the same day for a velocity bump.
- Pin "good first issues" so anyone interested can contribute.

---

## 7. How to drive Claude Code with this

- Feed **one phase per session/PR**. End each with: *"Implement this phase. Stop at the Definition of Done and tell me how to verify it."*
- Insist on the Vitest tests in P1 — the balance/budget/goal math is where correctness lives.
- After each front-end phase, run the **`vitaflow-ui-qa`** skill on the diff (mobile layout, empty/error states, a11y) before moving on.
- Commit per phase for clean rollbacks.

---

## 8. Quick reference — your setup
- Accounts: GCash, Maya, Maribank, AUB HelloMoney (income source). Currency ₱ (PHP).
- Must-haves: centralized dashboard + net worth, goals, category budgets, manual entry + statement import.
- Non-goals (v1): bank APIs, accounts/login, cloud, ads, subscriptions.
