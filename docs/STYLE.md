# Design System — "Pera" (working name)

> **Aesthetic:** Lista PH's bold *block-text* energy (big confident numbers, friendly rounded cards, clear Money In / Money Out) **+** Lemoneyd's calm, net-worth-first clarity (uncluttered, organized, everything at a glance). **Dark-first**, with a clean light mode. One punchy accent, flat surfaces, generous whitespace.
>
> Everything here is a token so the look is **edited in one place**. Change the accent or font once → it updates everywhere.

## Type

Both are free Google Fonts (install via `@fontsource/*` or a Google `<link>`).

- **Display / numbers:** `Space Grotesk` — weights 500, 700. Used for the net-worth hero, card balances, section titles, any big number. This is the "block text" feel.
- **Body / labels:** `Plus Jakarta Sans` — weights 400, 500, 600. Used for labels, list rows, buttons, paragraphs.
- *Swap later in one line:* change `fontFamily.display` / `fontFamily.sans` in `tailwind.config.js`. (If you ever want it closer to Lista, try `General Sans` or `Clash Display` from Fontshare.)

Type scale:

| Role | Font / size / weight | Notes |
|---|---|---|
| Net-worth hero | Space Grotesk · 42px · 700 · -1.5px tracking | the headline number |
| Card balance / big number | Space Grotesk · 18–20px · 700 | tight tracking |
| Section title | Space Grotesk · 18px · 700 | |
| Label / eyebrow | Plus Jakarta · 11–12px · 600 · UPPERCASE · +1.5px tracking | muted color |
| Body / rows | Plus Jakarta · 14–16px · 400–500 | line-height 1.5 |

## Color tokens (CSS variables)

Define both themes; default to system, with a manual toggle (`data-theme="dark|light"` on `<html>`).

```css
:root[data-theme="dark"]{
  --bg:#0B0C10; --surface:#14161D; --surface-2:#1B1E26; --border:#20232C;
  --text:#F4F5F7; --text-muted:#9AA0AA; --text-dim:#7E848E;
  --accent:#34D399;            /* emerald — primary action / brand */
  --pos:#34D399; --neg:#F87171; --warn:#FBBF24;   /* Money In / Out / near-limit */
}
:root[data-theme="light"]{
  --bg:#F6F7F9; --surface:#FFFFFF; --surface-2:#FFFFFF; --border:#E6E8EC;
  --text:#14161D; --text-muted:#5F6671; --text-dim:#8A909B;
  --accent:#0FB67E;
  --pos:#0FB67E; --neg:#DC2626; --warn:#D97706;
}
```

Account brand dots (consistent identity per account): GCash `#3B82F6`, Maya `#22C55E`, Maribank `#F97316`, AUB HelloMoney `#14B8A6`, Cash `#9AA0AA`.

## Shape, spacing, elevation

- **Radius:** cards `16px`, tiles/inputs `12px`, pills `20px`, FAB `50%`.
- **Borders over shadows:** `1px solid var(--border)`. Flat and modern — no heavy drop shadows (focus rings only).
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 px. Cards padded `13–16px`; screen gutter `18px`.
- **Whitespace is a feature** (the Lemoneyd calm). Don't crowd.

## Components

- **Net-worth hero:** eyebrow label + huge Space Grotesk number + small +/-% in `--pos`/`--neg`. Optional mini trend sparkline.
- **Account card:** brand dot + name (muted) + balance (block number). Grid of 2 on mobile.
- **Money In / Out:** income in `--pos`, expense in `--neg`, transfers neutral (`--text-muted`). Always sign the amount.
- **Budget bar:** 8px track (`--border`) + fill; fill is `--accent` under 80%, `--warn` 80–100%, `--neg` over 100%.
- **Goal ring:** circular progress (`--accent`) with % in the center (Space Grotesk).
- **Bottom nav:** 4 items (Home, Activity, Budgets, Goals); active item in `--accent`.
- **FAB:** accent-filled circle, "+", bottom-right.
- **States:** every list/section needs empty, loading, and error states. Empty states are friendly one-liners (Lista tone).

## Principles

1. **Net worth first.** The home screen answers "what am I worth right now?" in one glance (Lemoneyd).
2. **Big and bold where it counts.** Numbers are the hero; everything else recedes (Lista).
3. **Calm, not busy.** Few colors, lots of space, one accent.
4. **Tokens everywhere.** No hard-coded hex in components — only `var(--*)` and Tailwind tokens, so re-theming is trivial.
5. **Dark-first, light parity.** Both themes must be readable; test every color in both.
