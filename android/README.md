# Pera — Android app + home-screen widget

This is the [Capacitor](https://capacitorjs.com) wrapper around the Pera web app
plus a native **Jetpack Glance** home-screen widget. It reuses the exact same
React/Dexie app (no rewrite) and adds the native bits you can't do from the web:
an installable APK and a real home-screen widget.

Android-only, personal, no Play Store. iOS stays the PWA.

---

## What's here (the native pieces)

| Piece | File | Role |
|---|---|---|
| App shell | `app/src/main/java/app/pera/tracker/MainActivity.kt` | Capacitor `BridgeActivity`; registers the widget plugin and schedules the hourly refresh. |
| Snapshot model | `…/WidgetSnapshot.kt` | Reads the JSON snapshot the web app writes (SharedPreferences `CapacitorStorage` / key `pera.widget.snapshot`) and formats money. |
| Widget UI | `…/PeraWidget.kt` | Glance widget: net worth, this-month budget bar, `updatedAt`, and **+ Expense** / **+ Income** buttons. Dark (near-black + emerald). |
| Widget provider | `…/PeraWidgetReceiver.kt` | `GlanceAppWidgetReceiver` the system talks to. |
| JS→native bridge | `…/WidgetBridgePlugin.kt` | Capacitor plugin `WidgetBridge.refresh()` — forces the widget to recompose after a write. |
| Periodic refresh | `…/WidgetRefreshWorker.kt` | WorkManager hourly fallback so the widget never goes stale. |
| Widget metadata | `app/src/main/res/xml/pera_widget_info.xml` | `AppWidgetProviderInfo` (size, preview, category). |
| Manifest | `app/src/main/AndroidManifest.xml` | Registers the receiver + the `pera://` deep-link intent-filter. |

Web-side glue (in `../src`): `lib/snapshot.ts` (build + publish snapshot),
`native/widget.ts` (plugin proxy), `native/deepLink.ts` (route `pera://quick-add`
→ `/#/quick-add`), `native/SnapshotPublisher.tsx` (republish on every write).

### The data flow

```
React app (IndexedDB)
  └─ snapshot.ts  → @capacitor/preferences ("pera.widget.snapshot")
                  → WidgetBridge.refresh() ─┐
WorkManager (hourly) ──────────────────────┤→ PeraWidget reads SharedPreferences → renders
Widget "+ Expense" button → pera://quick-add?type=expense
  → MainActivity → Capacitor appUrlOpen → /#/quick-add → save → re-publish → widget updates
```

---

## Prerequisites

- **Android Studio** (bundles a JDK 21 at `…/Android Studio/jbr`) and the
  **Android SDK** (platform 36, build-tools 36+).
- A phone with **USB debugging** or **"install unknown apps"** enabled for sideloading.

## Build the APK

Any time the web app changes, re-sync first from the repo root:

```bash
npm run build
npx cap sync android
```

Then build the debug APK:

```bash
cd android
./gradlew assembleDebug          # macOS/Linux
.\gradlew.bat assembleDebug      # Windows
```

Output: **`android/app/build/outputs/apk/debug/app-debug.apk`**

> If Gradle can't find Java/the SDK, either open the project in Android Studio
> once (it wires both automatically), or set them by hand:
> - `JAVA_HOME` → `C:\Program Files\Android\Android Studio\jbr`
> - create `android/local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

### Or build in Android Studio

1. **File → Open** → select the `android/` folder; let Gradle sync.
2. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Click **locate** in the toast to find `app-debug.apk`.
4. To point Studio at the SDK/JDK: **File → Settings → Build, Execution,
   Deployment → Build Tools → Gradle** (Gradle JDK) and
   **Appearance & Behavior → System Settings → Android SDK**.

## Sideload onto your phone

**USB (simplest):**
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
(or just **Run ▶** from Android Studio with the phone connected.)

**Manual:** copy `app-debug.apk` to the phone, tap it, allow "install unknown
apps" for your file manager, install.

## Add the widget

Long-press the home screen → **Widgets** → find **Pera** → drag it out. It shows
net worth + this month's budget and the two quick-add buttons. Tap **+ Expense**
/ **+ Income** to jump straight into the app's quick-add screen.

## Notes

- The widget is **display + buttons** — you type in the app's quick-add, not the
  widget (Android widgets can't host text input).
- Data lives only on the device (IndexedDB), same as the PWA. The snapshot is a
  tiny read-only mirror for the widget.
- App id: `app.pera.tracker`. Change it via `../capacitor.config.ts` +
  `applicationId` in `app/build.gradle` if you want.
