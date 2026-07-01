package app.pera.tracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mutates the published snapshot in place so a log reflects on the widgets
 * IMMEDIATELY, before the web app has run. This is an OPTIMISTIC estimate; the
 * next app launch drains the pending queue and republishes the true snapshot,
 * which overwrites this. We touch the headline figures (net worth + the
 * monthly-budget line) AND prepend to recent[] so the Activity widget updates
 * instantly too — enough to feel instant without re-deriving everything.
 */
object SnapshotStore {
    private const val MAX_RECENT = 5

    /**
     * Apply one logged transaction to the stored snapshot. `signedAmount` is
     * signed minor units (expense negative, income positive); `type` is
     * "expense" | "income"; `label` is the row label shown on the Activity
     * widget (falls back to the type name when blank).
     */
    fun applyOptimisticLog(context: Context, signedAmount: Long, type: String, label: String?) {
        val prefs = context.getSharedPreferences(WidgetSnapshot.PREFS_FILE, Context.MODE_PRIVATE)
        val raw = prefs.getString(WidgetSnapshot.KEY, null) ?: return
        val o = try {
            JSONObject(raw)
        } catch (_: Throwable) {
            return
        }
        val isExpense = type == "expense"

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

        // Prepend to recent[] (cap 5) so the Activity widget shows this log now,
        // not only after the web republishes. The next real publish overwrites
        // recent[] with the true, complete list.
        val now = System.currentTimeMillis()
        val item = JSONObject().apply {
            put("date", now)
            put("label", label?.takeIf { it.isNotBlank() } ?: if (isExpense) "Expense" else "Income")
            put("signedAmount", signedAmount)
            put("type", type)
        }
        val prev = o.optJSONArray("recent") ?: JSONArray()
        val next = JSONArray().apply {
            put(item)
            for (i in 0 until minOf(prev.length(), MAX_RECENT - 1)) put(prev.getJSONObject(i))
        }
        o.put("recent", next)

        o.put("updatedAt", now)
        prefs.edit().putString(WidgetSnapshot.KEY, o.toString()).apply()
    }
}
