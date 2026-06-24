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

        PendingStore.enqueue(context, account, signed, type, category)
        SnapshotStore.applyOptimisticLog(context, signed, type == "expense")
        refreshAllWidgets(context)
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
 * Open the dialog-themed quick-add POP-UP over the home screen (a small floating
 * window, the app isn't fully opened). Explicit component → bypasses filters;
 * Capacitor reads the data URI as the launch URL and routes to /#/quick-add.
 * FLAG_ACTIVITY_NEW_TASK is required when starting an Activity from a widget.
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
                Intent.FLAG_ACTIVITY_MULTIPLE_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP,
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
