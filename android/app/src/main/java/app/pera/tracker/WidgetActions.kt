package app.pera.tracker

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll

// Shared action plumbing for all four widgets: the preset instant-log callback,
// the deep-link / pop-up intents, and a refresh-all helper. Top-level keys are
// visible package-wide (same package), so the widgets reference them directly.

val KEY_AMOUNT = ActionParameters.Key<Long>("amount") // SIGNED minor units
val KEY_TYPE = ActionParameters.Key<String>("type") // "expense" | "income"
val KEY_ACCOUNT = ActionParameters.Key<String>("account")
val KEY_CATEGORY = ActionParameters.Key<String>("category") // "" = none
val KEY_LABEL = ActionParameters.Key<String>("label") // row label for recent[]

/** Intent extra: which mode the native quick-add dialog opens in. */
const val EXTRA_TYPE = "app.pera.tracker.extra.TYPE"

/**
 * Swallows repeated widget-tap launches within a short window. Widget taps can
 * double-fire, and a cold Activity start is heavy; ~800 ms is enough to reuse
 * the one window instead of stacking or re-launching.
 */
object LaunchDebounce {
    private const val WINDOW_MS = 800L
    @Volatile private var last = 0L

    fun allow(): Boolean {
        val now = System.currentTimeMillis()
        if (now - last < WINDOW_MS) return false
        last = now
        return true
    }
}

/**
 * Tapping a preset button: enqueue a pending transaction, optimistically update
 * the snapshot so the budget/net-worth figures move instantly, then recompose
 * every placed widget. No UI is shown. The web app reconciles on next launch.
 */
class LogPresetAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val signed = parameters[KEY_AMOUNT] ?: return
        val type = parameters[KEY_TYPE] ?: "expense"
        val account = parameters[KEY_ACCOUNT] ?: return
        if (account.isEmpty()) return
        val category = parameters[KEY_CATEGORY]?.takeIf { it.isNotEmpty() }
        val label = parameters[KEY_LABEL]

        PendingStore.enqueue(context, account, signed, type, category)
        SnapshotStore.applyOptimisticLog(context, signed, type, label)
        refreshAllWidgets(context)
    }
}

/**
 * Tapping "+": open the NATIVE quick-add dialog (no WebView, instant). Debounced
 * so bashing "+" can't stack launches. This is the primary typed-add path (the
 * WebView pop-up is kept only as a fallback).
 */
class OpenQuickAddAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        if (!LaunchDebounce.allow()) return
        val type = parameters[KEY_TYPE] ?: "expense"
        context.startActivity(quickAddNativeIntent(context, type))
    }
}

/** Recompose every Pera widget from the freshly written snapshot. */
suspend fun refreshAllWidgets(context: Context) {
    BudgetWidget().updateAll(context)
    NetWorthWidget().updateAll(context)
    GoalsWidget().updateAll(context)
    ActivityWidget().updateAll(context)
}

/**
 * Open the NATIVE dialog-themed quick-add Activity (Compose, no WebView) over
 * the home screen. Explicit component; the mode rides in an extra. Reuse flags
 * (SINGLE_TOP | CLEAR_TOP | REORDER_TO_FRONT) so a second tap re-fronts the one
 * window instead of stacking. NEW_TASK is required to start from a widget.
 */
fun quickAddNativeIntent(context: Context, type: String): Intent =
    Intent(context, QuickAddNativeActivity::class.java).apply {
        putExtra(EXTRA_TYPE, type)
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
        )
    }

/**
 * Open the dialog-themed quick-add POP-UP over the home screen (WebView
 * fallback, kept for when the native dialog isn't wanted). Explicit component →
 * bypasses filters; Capacitor reads the data URI as the launch URL and routes
 * to /#/quick-add. Reuse flags (drop MULTIPLE_TASK, add SINGLE_TOP |
 * REORDER_TO_FRONT) so repeated taps reuse the one pop-up instead of stacking
 * WebViews. FLAG_ACTIVITY_NEW_TASK is required when starting from a widget.
 */
fun popupIntent(context: Context, type: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("pera://quick-add?type=$type&popup=1"),
        context,
        QuickAddPopupActivity::class.java,
    ).apply {
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
        )
    }

/**
 * Open the FULL app at quick-add (used when a widget wants the whole app, not
 * the pop-up). FLAG_ACTIVITY_NEW_TASK is the fix for the old "+ Expense not
 * responding" bug — launching MainActivity from a widget needs it.
 */
fun quickAddIntent(context: Context, type: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("pera://quick-add?type=$type"),
        context,
        MainActivity::class.java,
    ).apply {
        addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
    }

/** Open the app's home screen. */
fun openAppIntent(context: Context): Intent =
    Intent(context, MainActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
