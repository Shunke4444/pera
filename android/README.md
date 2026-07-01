# Pera — Android app + home-screen widgets (v2)

This is the [Capacitor](https://capacitorjs.com) wrapper around the Pera web app
plus **four native Jetpack Glance home-screen widgets** and two ways to log a
transaction without opening the app. It reuses the exact same React/Dexie app
(no rewrite) and adds the native bits the web can't do: an installable APK, real
home-screen widgets, a floating quick-add pop-up, and instant background logging.

Android-only, personal, no Play Store. iOS stays the PWA.

---

## The four widgets

Each is a separate Glance provider you add on its own from the widget picker
(long-press home screen → **Widgets** → **Pera**). All dark (near-black +
emerald) with proper padding.

| Widget | Shows | Logs? |
|---|---|---|
| **Budget** (flagship) | This month spent / cap, progress bar, remaining + days left, top categories | Preset buttons + **+** dialog |
| **Net worth** | Net worth headline + a mini budget line | Preset buttons + **+** dialog |
| **Goals** | Top savings goal: name, %, progress bar, saved / target | Opens app |
| **Activity** | Last few transactions (label + signed amount) | Opens app |

## Two ways to log from the home screen

1. **Preset button → instant log (no UI).** Tapping e.g. "Food ₱100" writes a
   *pending transaction* to native storage and **optimistically** updates the
   snapshot, so the Budget widget's spent jumps immediately. Nothing opens. On
   the next app launch the web app **drains** that queue into IndexedDB
   (idempotent by pending id — never double-posts) and republishes the true
   snapshot. Presets are defined in **Settings → Widget quick-add presets**.
2. **"+" → native typed dialog (instant).** Tapping **+** opens
   `QuickAddNativeActivity` — a small **Jetpack Compose** dialog (amount
   number-pad + account + category chips + Save) floating over the home screen.
   It's **not a WebView**: no Capacitor boot, so it opens and saves in a blink.
   On Save it writes to the **same native queue** the presets use
   (`PendingStore.enqueue` + `SnapshotStore.applyOptimisticLog` +
   `refreshAllWidgets`); the web app reconciles it into IndexedDB on the next
   launch (idempotent drain — never double-posts). Launches are **debounced
   (~800 ms)** so bashing **+** can't stack windows.

   The old WebView pop-up (`QuickAddPopupActivity`, hosting `/#/quick-add`) is
   kept only as a **fallback** — same-origin so it shares the real IndexedDB, but
   its cold-start is why the native dialog is now the default.

---

## What's here (the native pieces)

| Piece | File | Role |
|---|---|---|
| App shell | `…/MainActivity.kt` | Capacitor `BridgeActivity`; registers the bridge plugin + schedules the hourly refresh. |
| Native quick-add | `…/QuickAddNativeActivity.kt` | Compose dialog (number-pad + account/category chips). Writes to `PendingStore` — no WebView. Primary "+" path. |
| Pop-up shell (fallback) | `…/QuickAddPopupActivity.kt` | Dialog-themed `BridgeActivity` hosting `/#/quick-add?...&popup=1`. Same origin → same IndexedDB. |
| Snapshot model | `…/WidgetSnapshot.kt` | Parses the v2 JSON snapshot (budget detail + top categories, goals, recent, presets) and formats money. |
| Snapshot mutate | `…/SnapshotStore.kt` | Optimistically applies a preset log to the stored snapshot (budget + net worth) so the widget feels instant. |
| Pending queue | `…/PendingStore.kt` | Appends a pending transaction to shared storage for the web app to drain. |
| Widget actions | `…/WidgetActions.kt` | `LogPresetAction` (instant-log), `OpenQuickAddAction` (debounced native-dialog launch), the native/pop-up/deep-link/open-app intents, refresh-all helper. |
| Shared UI | `…/WidgetTheme.kt` | Palette, color parsing, and shared Glance composables (scaffold, preset/add buttons, budget bar). |
| Widgets | `…/BudgetWidget.kt`, `NetWorthWidget.kt`, `GoalsWidget.kt`, `ActivityWidget.kt` | The four Glance widgets, each with its `GlanceAppWidgetReceiver`. |
| JS→native bridge | `…/WidgetBridgePlugin.kt` | `WidgetBridge.refresh()` (recompose all widgets) + `WidgetBridge.dismissPopup()` (finish the pop-up). |
| Periodic refresh | `…/WidgetRefreshWorker.kt` | WorkManager hourly fallback so widgets never go stale. |
| Widget metadata | `app/src/main/res/xml/{budget,networth,goals,activity}_widget_info.xml` | One `AppWidgetProviderInfo` per widget (size, preview, padding). |
| Pop-up theme | `app/src/main/res/values/styles.xml` (`AppTheme.Popup`) | Translucent dialog theme for the pop-up Activity. |
| Manifest | `app/src/main/AndroidManifest.xml` | Registers the four receivers, the pop-up Activity, and the `pera://` deep link. |

Web-side glue (in `../src`):
- `lib/snapshot.ts` — `buildSnapshotData` (pure, unit-tested v2 shape) + `publishSnapshot`.
- `lib/pending.ts` — `parsePendingQueue` + `planDrain` (pure, unit-tested idempotency).
- `db/repo.ts` — `drainPendingQueue` / `drainPendingTxns` (idempotent by pending id), preset upsert/delete.
- `native/pendingStore.ts` — read/clear the native pending queue via `@capacitor/preferences`.
- `native/popup.ts` — detect popup mode + `dismissPopup()`.
- `native/widget.ts` — the `WidgetBridge` plugin proxy.
- `native/deepLink.ts` — route `pera://quick-add` → `/#/quick-add`.
- `components/PresetManager.tsx` + Settings — define presets (published into the snapshot).

### Data flow

```
React app (IndexedDB)
  └─ snapshot.ts → @capacitor/preferences("pera.widget.snapshot")
                 → WidgetBridge.refresh() ─┐
WorkManager (hourly) ─────────────────────┤→ widgets read SharedPreferences → render
                                           │
Preset tap → LogPresetAction               │
  → PendingStore.enqueue("pera.widget.pending")   (a pending txn)
  → SnapshotStore.applyOptimisticLog()            (instant: figures + recent[])
  → refreshAllWidgets() ───────────────────┘
  → next app launch: drainPendingQueue() imports it into IndexedDB
    (idempotent by pending id) → republishes the TRUE snapshot

"+" tap → OpenQuickAddAction (debounced) → QuickAddNativeActivity (Compose)
  → Save → PendingStore.enqueue + applyOptimisticLog + refreshAllWidgets
  → next app launch: drainPendingQueue() imports it (same idempotent path)

"+" fallback → QuickAddPopupActivity (pera://quick-add?...&popup=1)
  → same-origin WebView → real IndexedDB write → publishSnapshot() → dismissPopup()
```

The native dialog and the preset tap share one path: both only touch native
storage, so both feel instant and both reconcile through the same idempotent
`drainPendingQueue()`. `applyOptimisticLog` also **prepends the logged row to
`recent[]`** (cap 5), so a home-screen log shows on the **Activity** widget
immediately — the next real publish overwrites `recent[]` with the true list.

---

## Prerequisites

- **Android Studio** (bundles a JDK 21 at `…/Android Studio/jbr`) and the
  **Android SDK** (platform 36, build-tools 36+).
- A phone with **USB debugging** or **"install unknown apps"** enabled.

## Build the APK

Any time the web app changes, re-sync first from the repo root:

```bash
npm run build
npx cap sync android
```

Then build the debug APK:

```bash
cd android
.\gradlew.bat assembleDebug      # Windows
./gradlew assembleDebug          # macOS/Linux
```

Output: **`android/app/build/outputs/apk/debug/app-debug.apk`**

> If Gradle can't find Java/the SDK: open the project in Android Studio once (it
> wires both), or set them by hand:
> - `JAVA_HOME` → `C:\Program Files\Android\Android Studio\jbr`
> - `android/local.properties` → `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

## Sideload

**USB:** `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
(or **Run ▶** from Android Studio).

**Manual:** copy the APK to the phone, tap it, allow "install unknown apps".

After native changes you must rebuild + reinstall; after pure web changes,
`npm run build && npx cap sync android` then rebuild.

## Add the widgets

Long-press the home screen → **Widgets** → scroll to **Pera** → you'll see
**Budget**, **Net worth**, **Goal**, and **Activity** as four separate entries.
Drag any onto the home screen.

---

## Debugging the "+" deep link (Logcat)

The "+ Expense not responding" bug was a missing `FLAG_ACTIVITY_NEW_TASK` —
launching an Activity from a widget (a non-Activity context) requires it. All
widget intents now set it (`WidgetActions.kt`). To watch the deep link fire:

```bash
adb logcat -c                                  # clear
adb logcat | grep -iE "pera|Capacitor|appUrlOpen|quick-add"
# tap a widget "+" or "Open" — you should see the Activity start and the
# Capacitor bridge load the URL. No line = the PendingIntent never fired
# (usually a background-start restriction; see MIUI below).
```

If a tap does nothing on a stock device, confirm the receiver is enabled and the
intent is explicit (it targets a concrete component — `MainActivity` /
`QuickAddNativeActivity` / `QuickAddPopupActivity`).

## OEM background-launch permissions (the "first tap does nothing" fix)

A widget tap starts a window **from the background**. Stock Android allows it,
but several OEM skins block it by default — so on those phones the first tap(s)
on **+** (and sometimes a preset log) silently do nothing until you grant a
per-app permission. There's no way to request these programmatically; they're
user-granted, once, in system Settings. The app also surfaces a one-time note in
**Settings → Quick add** (Android only).

Grant **"display pop-up / start in background"** and set battery to
**unrestricted**. Exact path by skin:

| Skin (maker) | Path | Toggles to enable |
|---|---|---|
| **MIUI / HyperOS** (Xiaomi, Redmi, POCO) | Settings → Apps → Pera → **Other permissions** | **Display pop-up windows while running in background**; **Start in background**. Then Settings → Apps → Pera → **Autostart** ON, and **Battery saver → No restrictions**. |
| **ColorOS** (Oppo) | Settings → Apps → Pera → **Allow auto-launch** | Enable auto-launch; then **Battery → Power consumption / Allow background activity** ON (and **Allow background pop-up** if listed). |
| **Realme UI** (Realme) | Settings → Apps → Pera | Enable **Auto-launch / Allow auto start**; **Battery → Allow background activity** and **Allow background pop-up windows** ON. |
| **Funtouch OS / OriginOS** (Vivo, iQOO) | Settings → Apps → Pera, plus **i Manager → App manager → Autostart** | Turn **Autostart** ON; enable **Background pop-up / Display pop-up windows while running in background**; **Battery → High background power consumption** allowed. |
| **One UI** (Samsung) | Settings → Apps → Pera → **Battery** | Set to **Unrestricted**. (Samsung rarely blocks the pop-up itself, but Deep Sleep can kill background logs.) |

If **+** works but only after the first dud tap, that's this restriction — grant
it once and it's reliable. If it never fires even after granting, capture Logcat
(above) and check the Activity start.

Activity flags in play (already set): both quick-add activities use
`FLAG_ACTIVITY_NEW_TASK | SINGLE_TOP | CLEAR_TOP | REORDER_TO_FRONT` with
`taskAffinity=""` and `excludeFromRecents="true"`, so a tap floats over the
launcher and a second tap **re-fronts the one window** instead of stacking new
ones. `OpenQuickAddAction` also debounces launches (~800 ms).

---

## Notes & known limits

- Glance has no arc primitive, so the **Goals** widget uses a coloured bar +
  percent instead of the app's ring.
- The preset instant-log is **optimistic**: the widget's figure is an estimate
  until the next app launch drains the queue and republishes the true snapshot.
  Draining is idempotent by pending id, so an un-cleared queue never duplicates.
- The pop-up loads the full app then routes to quick-add, so there can be a brief
  flash before the bare card shows.
- If preset/pop-up logging ever proves flaky on a device, the fallback is to make
  the preset open the pop-up pre-filled (a sub-second flash, but a direct write
  with no queue). The queue is what ships.
- Data lives only on the device (IndexedDB), same as the PWA. The snapshot +
  pending queue are tiny native mirrors.
- App id: `app.pera.tracker` (change via `../capacitor.config.ts` + `applicationId`).
