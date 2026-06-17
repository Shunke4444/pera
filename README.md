# Pera — Money Tracker

A **free, open-source, local-first** money tracker. Open it, see all your accounts and net worth at a glance, track goals, and set category budgets. No bank login, no account, no subscription, no servers — your data lives on your device and **can never be shut down**.

> Built for personal use across PH e-wallets and banks (GCash, Maya, Maribank, AUB HelloMoney). Manual entry plus statement import.

## Why
Most trackers either die (Mint, Maybe, Ivy Wallet), lock you into a subscription, or demand a bank login. Pera is the opposite: bold and simple to use, calm and net-worth-first to read, yours to own and fork.

## Design
Lista PH's bold "block-text" energy + Lemoneyd's calm, net-worth-first clarity. Dark-first, clean cards, big confident numbers. See [`docs/STYLE.md`](docs/STYLE.md).

## Features (v1 target)
- Centralized dashboard: every account + total net worth
- Manual entry + statement import (CSV/Excel, then per-bank PDF)
- Category budgets with progress
- Savings goals with progress
- Spending insights + net-worth trend
- Installable PWA, fully offline, JSON/CSV export

## Run it locally
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in /dist
npm run preview  # serve the build
```
Requires Node 18+. To "install" on your phone: open the URL → Add to Home Screen.

## Tech
Vite + React + TypeScript, Tailwind, Dexie (IndexedDB), Recharts, vite-plugin-pwa. Local-first, no backend.

## Roadmap / how it's built
The full build plan is in [`docs/BUILD-SPEC.md`](docs/BUILD-SPEC.md), built phase by phase. This repo currently contains the P0 scaffold (UI shell + styled dashboard with seed data). Next phases add the real data layer, transactions, budgets, goals, insights, and import.

## License
[MIT](LICENSE). Free forever.
