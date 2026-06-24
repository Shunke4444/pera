package app.pera.tracker

import android.content.Context
import org.json.JSONObject

/**
 * Mutates the published snapshot in place so a preset tap reflects on the widget
 * IMMEDIATELY, before the web app has run. This is an OPTIMISTIC estimate; the
 * next app launch drains the pending queue and republishes the true snapshot,
 * which overwrites this. We only touch the headline figures (net worth + the
 * monthly-budget line) — enough to feel instant without re-deriving everything.
 */
object SnapshotStore {
    /**
     * Apply one logged transaction to the stored snapshot. `signedAmount` is
     * signed minor units (expense negative, income positive).
     */
    fun applyOptimisticLog(context: Context, signedAmount: Long, isExpense: Boolean) {
        val prefs = context.getSharedPreferences(WidgetSnapshot.PREFS_FILE, Context.MODE_PRIVATE)
        val raw = prefs.getString(WidgetSnapshot.KEY, null) ?: return
        val o = try {
            JSONObject(raw)
        } catch (_: Throwable) {
            return
        }

        // Net worth moves by the signed amount (expense down, income up).
        o.put("netWorth", o.optLong("netWorth", 0L) + signedAmount)
        if (signedAmount < 0L) {
            o.put("assets", o.optLong("assets", 0L) + signedAmount)
        }

        // Only expenses count against the monthly budget.
        if (isExpense) {
            val b = o.optJSONObject("budget")
            if (b != null) {
                val mag = -signedAmount // positive magnitude
                val spent = b.optLong("spent", 0L) + mag
                val cap = b.optLong("cap", 0L)
                b.put("spent", spent)
                b.put("remaining", cap - spent)
                val pct = if (cap > 0L) spent.toDouble() / cap.toDouble() * 100.0 else 0.0
                b.put("level", if (pct > 100.0) "over" else if (pct >= 80.0) "warn" else "ok")
            }
        }

        o.put("updatedAt", System.currentTimeMillis())
        prefs.edit().putString(WidgetSnapshot.KEY, o.toString()).apply()
    }
}
