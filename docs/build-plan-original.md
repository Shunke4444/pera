# Personal Money Tracker — Build Plan

> A "Lemoneyd-style" offline-first finance tracker for personal use. Open it → see all your banks as cards with a net-worth total, log transactions manually, view charts. Works fully offline; optional sync later.
>
> **This doc is written to be handed to Claude Code.** Build it phase by phase. Each phase has an explicit *Definition of Done* — treat that as the acceptance test before moving on.

---

## 1. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Platform | **Installable PWA** (web app, "Add to Home Screen") | Fastest to build, runs offline, one codebase, no app-store review. Feels native on the phone. |
| Framework | **React + TypeScript + Vite** | Matches your existing stack (React/TS). Vite = fast dev + easy PWA. |
| Styling | **Tailwind CSS + Headless UI** | What you already use. Mobile-first utility classes. |
| Offline storage | **IndexedDB via Dexie.js** + `dexie-react-hooks` (`useLiveQuery`) | Real structured DB in the browser, reactive queries, 100% offline. localStorage is too small/clumsy for transactions. |
| PWA / offline shell | **vite-plugin-pwa** (Workbox) | Auto-generates service worker + manifest so the app loads with no network. |
| Charts | **Recharts** | Clean React API, good for pie/line/bar. |
| Routing | **React Router** | Standard. |
| Money precision | **Integer minor units (cents)** | Never store money as floats. Format with `Intl.NumberFormat`. |
| Sync | **Phase 6, optional** | Start local-only with JSON backup export/import. Add real sync only if you want multi-device. |

**Scope guardrail:** this is *personal, single-user, local-first*. No login, no backend, no multi-tenant anything in v1. Don't let the build drift into that.

---

## 2. Data model

Amounts are signed integers in **minor units** (e.g. ₱1,234.50 → `123450`). Expenses negative, income positive.

```ts
// Account = one bank account / wallet / card you want to see on the home screen
interface Account {
  id: string;                 // uuid
  name: string;               // "BPI Savings", "Cash", "GCash"
  bank: string;               // "BPI", "GCash", "Cash"  (used to group cards)
  type: 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'ewallet';
  currency: string;           // ISO 4217, e.g. "PHP" (default from settings)
  openingBalance: number;     // minor units; balance = opening + sum(txns)
  color?: string;             // card accent
  icon?: string;              // emoji or icon key
  archived: boolean;
  sortOrder: number;
  createdAt: number;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;             // signed minor units (+income / -expense)
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  categoryId?: string;        // omitted for transfers/adjustments
  transferAccountId?: string; // the OTHER account, when type === 'transfer'
  date: number;               // epoch ms (the day it happened)
  note?: string;
  createdAt: number;
}

interface Category {
  id: string;
  name: string;               // "Groceries", "Salary"
  kind: 'income' | 'expense';
  color: string;
  icon?: string;
}

interface Settings {
  id: 'singleton';
  baseCurrency: string;       // "PHP"
  theme: 'system' | 'light' | 'dark';
  lastBackupAt?: number;
}
```

### Balance logic (single source of truth)
- **Account balance** = `openingBalance + Σ(transaction.amount where accountId === account.id)`.
- **Adjustment** type = a correction txn. When the user types "my real balance is X", create an `adjustment` transaction = `X − currentComputedBalance`. This lets them reconcile to reality anytime without editing history.
- **Transfer** = **two linked transactions**: `−amount` on the source account, `+amount` on the destination, sharing a `transferGroupId` (add this field) so they edit/delete together. Transfers must **not** count as income/expense in spending charts.
- **Net worth** = `Σ balances` where credit/loan balances are naturally negative (they reduce the total). Show assets and liabilities subtotals too.

> Compute balances in a small pure module (`lib/balances.ts`) and **unit-test it** — this is the one place bugs actually hurt.

---

## 3. Screens

1. **Home / Dashboard** — Net-worth total at top (with assets vs. liabilities split). Below it, account **cards grouped by bank**, each showing name, type, current balance. A small net-worth sparkline. Tap a card → Account detail. FAB "+" to add a transaction.
2. **Account detail** — Big balance, "Adjust balance" button, that account's transaction list, edit/archive account.
3. **Add / Edit transaction** — amount keypad, type toggle (income/expense/transfer), account picker, category picker, date, note. Transfer mode shows a second account picker.
4. **Activity (all transactions)** — global list, grouped by date; filter by account / category / type; search by note; date range.
5. **Insights / Charts** — spending by category (pie or bar) for a period, income vs. expense per month (bar), net worth over time (line).
6. **Settings** — base currency, theme, manage accounts & categories, **Export backup (JSON)** / **Import backup**, last-backup timestamp.

**UX musts:** mobile-first (single column, thumb-reachable FAB), empty states ("No accounts yet — add your first"), loading is instant (local DB), dark mode.

---

## 4. Offline & sync strategy

**v1 — fully offline (do this):**
- All data in IndexedDB (Dexie). No network needed for anything.
- `vite-plugin-pwa` caches the app shell → opens offline, installable to home screen.
- **Backup = JSON export/import** in Settings. Cheap insurance against clearing browser data. Optionally let the user save the file to iCloud/Drive manually.

**v2 — optional online sync (only if you want multiple devices):** pick one, in order of effort:
- **Easiest:** keep local-only; sync = manually export/import the JSON, or drop it in a cloud-drive folder.
- **Turnkey offline-first sync:** Dexie Cloud — bolts onto the existing Dexie schema with minimal code; syncs in the background when online. (Paid SaaS; check current pricing.)
- **DIY backend:** Supabase (Postgres + auth) with a last-write-wins sync of changed rows. Most control, most work.

Design v1 so sync can be added later: every record already has a stable `id` and `createdAt`; add an `updatedAt` field now so a future sync has something to diff on.

---

## 5. Suggested project structure

```
money-tracker/
├─ public/                # icons, manifest assets
├─ src/
│  ├─ db/
│  │  ├─ schema.ts        # Dexie DB + tables + version()
│  │  └─ seed.ts          # default categories on first run
│  ├─ lib/
│  │  ├─ balances.ts      # pure balance/net-worth math (UNIT TESTED)
│  │  ├─ money.ts         # parse/format minor units, Intl.NumberFormat
│  │  └─ backup.ts        # export/import JSON
│  ├─ hooks/              # useAccounts, useTransactions, useNetWorth (useLiveQuery)
│  ├─ components/         # Card, Fab, AmountInput, CategoryPicker, charts...
│  ├─ screens/           # Dashboard, AccountDetail, TxnForm, Activity, Insights, Settings
│  ├─ App.tsx            # router + layout (bottom nav)
│  └─ main.tsx
├─ tests/                # balances.test.ts etc. (Vitest)
├─ vite.config.ts        # + VitePWA plugin
└─ tailwind.config.js
```

---

## 6. Build phases (give these to Claude Code one at a time)

### Phase 0 — Scaffold & PWA
Set up Vite + React + TS, Tailwind + Headless UI, React Router, Dexie + dexie-react-hooks, Recharts, vite-plugin-pwa. Bottom-nav app shell with placeholder screens. Manifest + icons.
**Done when:** app runs, builds clean, is installable on a phone, and **loads with the network turned off**.

### Phase 1 — Data layer
Dexie schema for all tables, seed default categories on first launch, `money.ts` and `balances.ts` with **Vitest unit tests** for balance, adjustment, transfer, and net-worth cases.
**Done when:** tests pass; you can create/read/update/delete records from a dev console and `useLiveQuery` re-renders on change.

### Phase 2 — Accounts & Dashboard
Add/edit/archive accounts. Dashboard: net-worth total (assets vs. liabilities) + account cards grouped by bank. Currency formatting.
**Done when:** adding/editing an account instantly updates the cards and the total; credit/loan accounts subtract from net worth.

### Phase 3 — Transactions
Add/edit/delete income & expense; account-detail transaction list; "adjust balance"; **transfers** as linked pairs; global Activity screen with filters + search.
**Done when:** balances always equal `opening + Σ txns`; transfers move money between accounts without showing up as spending; deleting a transfer removes both legs.

### Phase 4 — Insights / Charts
Spending by category (period selectable), income vs. expense per month, net worth over time. Transfers/adjustments excluded from spending.
**Done when:** charts match the underlying numbers for a hand-checked sample month.

### Phase 5 — Polish & backup
Empty/loading/error states, dark mode, install prompt, JSON **export/import backup**, `updatedAt` on writes, accessibility pass.
**Done when:** export → clear data → import restores everything exactly; app is pleasant on a real phone.

### Phase 6 — Sync (optional)
Add Dexie Cloud or Supabase per §4 only if multi-device is wanted.
**Done when:** a change on one device appears on another after both have been online.

---

## 7. How to drive Claude Code with this

- Feed it **one phase per session/PR**. Paste the phase text and end with: *"Implement this phase. Stop at the Definition of Done and show me how to verify it."*
- Keep money math in `lib/balances.ts` and insist on the Vitest tests in Phase 1 — that's the highest-leverage correctness check.
- After each front-end phase, run your **`vitaflow-ui-qa`** skill on the diff to catch mobile-layout / empty-state / a11y issues before you move on.
- Commit per phase so you can roll back cleanly.

## 8. Honest time estimate (you driving Claude Code)

| Milestone | Rough effort |
|---|---|
| Phases 0–2 (installable app that shows your banks + total) | ~half a day to a day |
| Phase 3 (transactions working correctly) | ~half a day |
| Phase 4–5 (charts + polish + backup) | ~half a day to a day |
| **Usable v1 total** | **~1 weekend** |
| Phase 6 (real cross-device sync) | +1–3 days, optional |

The reason it's this fast: no bank APIs, no backend, no auth, single user. Those are exactly the things you chose to skip.
