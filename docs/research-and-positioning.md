# Free, Open-Source, Local-First Money Tracker — Research & Plan

> Companion to `money-tracker-build-plan.md` (the technical build steps). This doc covers **the competitive landscape, the recurring problems to fix, how to position a free/open-source/local app, and how to ship it publicly**.
>
> *Research current as of June 2026. Open-source projects change — re-check stars/license/status before launch.*

---

## 1. The opportunity (why this is worth doing)

The manual-tracker space is real and active, but it has a structural weakness you can exploit: **apps keep dying, and the open-source ones are mostly heavy to run.**

- Mint shut down. **Maybe Finance archived its repo (Jul 27, 2025)** and pivoted to B2B. **Ivy Wallet is no longer maintained.** Users have been burned repeatedly and are actively looking for something they *own*.
- The strongest open-source options (**Firefly III**, **Maybe/Sure**) require self-hosting a server (Docker, PHP/Laravel or Ruby on Rails) — too much for a normal person.
- Even **Actual Budget** (the polished MIT-licensed leader) is *local-first but needs a server* the moment you want to sync to your phone or pull bank data.

The gap: **an active, mobile-first, zero-setup tracker that runs entirely on-device with no server, no account, and no subscription — and that you literally cannot get locked out of.** That's the lane.

---

## 2. Competitive landscape

### Open-source / self-hostable

| App | Tech | License | Local-first? | Platforms | Status | Notes |
|---|---|---|---|---|---|---|
| **Actual Budget** | Node/React | MIT | Yes (DB on device) | Web, iOS, Android, desktop | Active, ~27k★ | Best-in-class. Envelope/YNAB-style budgeting. **Needs a sync server** for multi-device or bank sync. |
| **Cashew** | Flutter + SQLite (Drift) + Firebase | Open source* | Yes (local SQL) | iOS, Android, **Web (PWA)**, GitHub | Active (2026) | **Your closest competitor.** Budgets, subscriptions, CSV import, multi-currency, recurring, goals, cloud sync, no ads. |
| **Firefly III** | PHP/Laravel | AGPL | No (self-hosted server) | Web (+ API, mobile via API) | Active | Double-entry accounting, rules engine, CSV/OFX/QIF import. Powerful but heavy. |
| **Maybe → "Sure"** | Ruby on Rails | AGPLv3 | No (self-hosted) | Web | Original archived; **fork `we-promise/sure` active** | Net-worth focused. |
| **Ivy Wallet** | Kotlin/Compose | Open source | Yes | Android | **Unmaintained** | Manual tracker; fork or grab final build. |
| **MoneyManager Ex** | C++/SQLite | GPL | Yes | Desktop (Win/Mac/Linux), mobile | Active, old-school | Mature, utilitarian. |
| **Wealthfolio** | Tauri/Rust | Open source | Yes (desktop local) | Desktop | Active | Investment/net-worth, privacy-first. |
| **HomeBank / ezBookkeeping / YAFFA** | various | GPL/MIT | Mixed | Desktop / self-hosted | Active | Older or niche. |

\* Cashew's source is on GitHub (`jameskokoska/Cashew`); confirm the exact license in its `LICENSE` file before claiming compatibility.

### Closed-source / freemium (the "manual + privacy" crowd you're imitating)

| App | Model | Angle |
|---|---|---|
| **Lemoneyd** | Freemium (~₱29/mo) | Manual, no bank link, PH-focused, savings/insurance/investments. |
| **Lemonbudget** | Paid | Encrypted, CSV import, receipt scan, scenario planning. |
| **Netvo** | Free, no account | Local-only net worth, live crypto prices. |
| **Bluecoins** (Android) | Freemium | Beloved manual tracker, very deep. |
| **Lunch Money / Copilot / Monarch / YNAB** | Subscription | Auto-sync + manual; polished; paid. |

**Takeaway:** the *closed* apps nail mobile UX but cost money and can vanish. The *open* apps are either heavy servers or abandoned. **Nobody owns "free + open + truly local + open-and-go on your phone."**

---

## 3. Common issues across the category (what to fix)

Compiled from reviews and user discussions. Each is an opening for you.

1. **Apps get shut down or acquired → data lost / forced migration.** (Mint, Maybe, Ivy Wallet.) → *Your fix: local data + full export + permissive OSS license = nothing to shut down.*
2. **Bank sync is flaky** (laggy, breaks, constant re-auth) — a top reason people go manual at all. → *Your fix: manual-first by design; sync is optional, not load-bearing.*
3. **Bad auto-categorization, no bulk re-categorize** (fix one, recurring ones stay wrong). → *Your fix: simple categories + bulk edit + remembered rules.*
4. **Edit/balance bugs** — e.g., Lemoneyd throws "insufficient balance" when you edit an old expense. → *Your fix: a pure, unit-tested balance engine (already in the build plan); editing history never corrupts balances.*
5. **Paywalls and ads on basic features.** → *Your fix: 100% free, no ads, no tiers.*
6. **Manual entry is tedious.** → *Your fix: fast entry, recurring templates, CSV import, optional "approximate" quick add.*
7. **Weak insights** — people want clear category breakdowns and trends. → *Your fix: a real Insights tab (donut + net-worth trend + income/expense).*
8. **Limited customization** (icons/emoji, categories). → *Your fix: custom icons/emoji + editable categories.*
9. **Multi-currency handled poorly** — users want to set manual FX rates. → *Your fix: per-account currency + manual rates.*
10. **Forced cloud / account required / privacy worries.** → *Your fix: no account, no servers, data never leaves the device unless the user exports it.*
11. **Self-hosting is too hard** for the open-source options. → *Your fix: zero setup — open a URL or a downloaded file.*

---

## 4. Positioning & differentiation

**One-line pitch:** *"A free, open-source money tracker that lives on your phone — open it, see all your accounts, no bank login, no account, no subscription, no server. Your data is yours and can't be taken away."*

Where you **win**:
- Zero setup vs every self-hosted option (no Docker/server, unlike Firefly/Maybe/Sure; no sync server required, unlike Actual for multi-device).
- Free + no ads vs Lemoneyd/Lunch Money/YNAB.
- Correctness + data ownership + "can't be shut down" vs the whole closed-source crowd.
- Net-worth-first "see my banks" dashboard (the Lemoneyd feel) in an open package.

Where you **won't** easily win (be honest):
- **Budgeting depth** → Actual Budget.
- **Accounting/rules/reporting** → Firefly III.
- **Feature maturity on mobile** → Cashew is years ahead. Your edge over Cashew is *simplicity, true no-account local, and specific fixes*, not breadth.

**Strategic implication:** compete on **simplicity, ownership, and correctness**, not feature count. Be the one people recommend with "it just works, it's free, and it's yours."

---

## 5. Feature plan (extends the build plan)

**v1 — the core that must be excellent**
- Net-worth dashboard: account cards grouped by bank + assets/liabilities total.
- Accounts + transactions with the **bulletproof balance engine** (the headline fix vs Lemoneyd).
- Categories, transfers (linked pairs), adjustments.
- Insights: spending by category + net-worth trend.
- Offline PWA, installable, **JSON + CSV export/import**.

**v1.1 — quick wins straight from the complaint list**
- Recurring transactions / templates; fast entry.
- Bulk re-categorize + remembered category rules.
- Custom icons/emoji; editable categories.
- Manual multi-currency FX; search & filters.

**v2 — the "some bank support" middle path + reach**
- **CSV / statement import** per bank (80% of sync value, 0 API cost).
- Biometric lock; better dark mode; backup reminders.
- Bring-your-own-cloud sync (a file in the user's Drive/iCloud, or optional Dexie Cloud/Supabase).

**Later / optional**
- Capacitor wrap → real iOS/Android app (biometrics, notifications, widgets) from the same code.
- Tauri → tiny desktop app.
- Opt-in automatic bank sync via an aggregator (Plaid/Salt Edge/etc.) — separate, heavy, has fees; only if there's demand.

---

## 6. How to ship it publicly (repo + free + run-local)

Because it's **local-first with no backend**, distribution is cheap and simple.

**License** — pick one:
- **MIT (recommended)** — maximum adoption, matches Actual Budget. Anyone can use/fork, including commercially.
- **AGPLv3** — forces anyone who runs a modified version (even as a web service) to share their changes. Matches Maybe/Firefly. Choose this if you want to prevent closed commercial forks. *Trade-off: scares off some contributors/companies.*

**Repo (GitHub, public):**
- Great `README` with screenshots + a **live demo link**, plus `LICENSE`, `CONTRIBUTING.md`, issue/PR templates, a `ROADMAP`, and tagged "good first issues" to attract contributors (solo-maintenance is the category's #1 killer — design for help).

**Hosting the PWA (free):**
- Static host: **GitHub Pages, Cloudflare Pages, Netlify, or Vercel.** No server, no running cost. Users visit the URL → "Add to Home Screen" → works offline forever.

**"Downloadable and run locally":**
- **Easiest for users:** the hosted URL (it's a PWA — it *is* local after first load).
- **Offline download:** publish a built `dist.zip` in **GitHub Releases**. Note: service workers don't run from `file://`, so include a one-liner — `npx serve` or `python -m http.server` — or ship a tiny launcher script.
- **For developers:** `git clone` → `npm install` → `npm run dev`.
- **Optional native/desktop:** Capacitor (mobile) or Tauri (desktop) from the same codebase.

**Data ownership (the whole point):**
- Everything in IndexedDB on the device. JSON + CSV export/import for backup and migration. No account, no servers, no telemetry. This is what lets you honestly say *"this can never be shut down."*

**Sustainability (optional):** GitHub Sponsors / Ko-fi link. No ads, ever — that's the brand.

---

## 7. Suggested launch roadmap

1. Build v1 per `money-tracker-build-plan.md` (with the balance engine + Insights).
2. Polish: README, screenshots, demo deploy, MIT `LICENSE`, export/import.
3. Soft launch: a PH personal-finance subreddit/Threads (where Lemoneyd spreads), r/selfhosted, r/opensource, Hacker News "Show HN", AlternativeTo + awesome-selfhosted listings.
4. Triage issues, ship v1.1 quick wins, label good-first-issues.
5. Decide on CSV import / sync based on what users actually ask for.

---

## 8. Decisions I need from you

- **License:** MIT (max reach) or AGPLv3 (keep forks open)?
- **App name** (and is the PH/₱ default fine, or currency-agnostic out of the box)?
- **Sync philosophy:** pure local + file backup only, or optional cloud sync from the start?
- **Targets:** PWA only first, or also Capacitor/Tauri wraps?
- **Do you want contributors** (shape repo for community) or keep it personal/solo?

Tell me these and I'll fold them in and scaffold the actual repo (README + license + project skeleton) next.
