package app.pera.tracker

import android.content.Context
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * The small JSON snapshot the web app publishes for the widget. The webview
 * can't read its own IndexedDB from native code, so the app writes this via
 * @capacitor/preferences (SharedPreferences file "CapacitorStorage", key
 * "pera.widget.snapshot"); the widget reads it here. All money is integer minor
 * units (centavos), matching the web app.
 */
data class WidgetSnapshot(
    val netWorth: Long,
    val monthBudgetSpent: Long,
    val monthBudgetCap: Long?, // null = no overall monthly budget set
    val currency: String,
    val updatedAt: Long,
    val topAccountName: String?,
    val topAccountBalance: Long?,
    val hasData: Boolean,
) {
    /** Spent / cap as 0f..1f (0 when no cap). */
    val budgetFraction: Float
        get() {
            val cap = monthBudgetCap ?: return 0f
            if (cap <= 0L) return 0f
            return (monthBudgetSpent.toFloat() / cap.toFloat()).coerceIn(0f, 1f)
        }

    fun formatMoney(minor: Long): String = formatMinor(minor, currency)

    companion object {
        const val PREFS_FILE = "CapacitorStorage" // @capacitor/preferences default group
        const val KEY = "pera.widget.snapshot"

        /** Read + parse the snapshot; returns an empty placeholder if absent/bad. */
        fun read(context: Context): WidgetSnapshot {
            val raw = context
                .getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                .getString(KEY, null)
            if (raw.isNullOrBlank()) return empty()
            return try {
                val o = JSONObject(raw)
                val top = o.optJSONObject("topAccount")
                WidgetSnapshot(
                    netWorth = o.optLong("netWorth", 0L),
                    monthBudgetSpent = o.optLong("monthBudgetSpent", 0L),
                    monthBudgetCap = if (o.isNull("monthBudgetCap")) null
                    else o.optLong("monthBudgetCap"),
                    currency = o.optString("currency", "PHP"),
                    updatedAt = o.optLong("updatedAt", 0L),
                    topAccountName = top?.optString("name"),
                    topAccountBalance = top?.optLong("balance"),
                    hasData = true,
                )
            } catch (_: Throwable) {
                empty()
            }
        }

        private fun empty() = WidgetSnapshot(
            netWorth = 0L,
            monthBudgetSpent = 0L,
            monthBudgetCap = null,
            currency = "PHP",
            updatedAt = 0L,
            topAccountName = null,
            topAccountBalance = null,
            hasData = false,
        )

        /** Integer minor units → "₱1,234.50" via the platform currency formatter. */
        fun formatMinor(minor: Long, currency: String): String {
            val nf = NumberFormat.getCurrencyInstance(Locale("en", "PH"))
            try {
                nf.currency = Currency.getInstance(currency)
            } catch (_: Throwable) {
                /* unknown code — keep locale default */
            }
            return nf.format(minor / 100.0)
        }
    }
}
