# Claude Code — build guide for Pera

You are continuing an existing scaffold. **Read `docs/BUILD-SPEC.md` and `docs/STYLE.md` first** — they are the source of truth.

## Where things stand
- P0 (scaffold + PWA + UI shell + styled dashboard with seed data) is **done**.
- Stack is locked: Vite + React + TS + Tailwind + Dexie + Recharts + vite-plugin-pwa.
- The design system (fonts, dark/light tokens, components) is in `docs/STYLE.md`. Use the CSS variables and Tailwind tokens already set up in `src/index.css` and `tailwind.config.js` — **no hard-coded colors**.

## How to proceed
Build **one phase at a time**, in order, starting at **P1** in `docs/BUILD-SPEC.md`:
P1 data layer + balance engine (with Vitest tests) → P2 accounts/dashboard (replace seed with real Dexie data) → P3 transactions → P4 budgets → P5 goals → P6 insights → P7 statement import → P8 polish/backup.

For each phase:
1. Implement only that phase.
2. Stop at its **Definition of Done** and explain how to verify it.
3. Keep money in integer minor units; put balance/budget/goal math in `src/lib/` as pure, unit-tested functions.
4. Commit with a clear message (e.g. `feat(p2): accounts + dashboard`).

## Accounts to keep seeded
GCash, Maya, Maribank, AUB HelloMoney (income source). Currency PHP (₱).

## Non-goals (v1)
No bank APIs, no login/accounts, no cloud, no ads, no subscriptions.
