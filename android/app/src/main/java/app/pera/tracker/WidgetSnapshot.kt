package app.pera.tracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * The JSON snapshot the web app publishes for the widgets (v2). The webview
 * can't read its own IndexedDB from native code, so the app writes this via
 * @capacitor/preferences (SharedPreferences file "CapacitorStorage", key
 * "pera.widget.snapshot"); the four widgets read it here. All money is integer
 * minor units (centavos), matching the web app.
 *
 * Shape (see src/lib/snapshot.ts):
 *   { netWorth, assets, liabilities, currency, updatedAt,
 *     budget: { spent, cap, level, remaining, daysLeft, projected,
 *               topCategories:[{name,color,spent,cap?}] } | null,
 *     goals:   [{ name, color, pct, saved, target }],
 *     recent:  [{ date, label, signedAmount, type }],
 *     presets: [{ id, label, amount, type, categoryId?, accountId }],
 *     topAccount?: { name, balance } }
 */
data class WidgetSnapshot(
    val netWorth: Long,
    val assets: Long,
    val liabilities: Long,
    val currency: String,
    val updatedAt: Long,
    val budget: Budget?,
    val goals: List<GoalItem>,
    val recent: List<RecentItem>,
    val presets: List<Preset>,
    val topAccountName: String?,
    val topAccountBalance: Long?,
    val hasData: Boolean,
) {
    data class Budget(
        val spent: Long,
        val cap: Long,
        val level: String, // "ok" | "warn" | "over"
        val remaining: Long,
        val daysLeft: Int,
        val projected: Long,
        val topCategories: List<TopCategory>,
    ) {
        /** spent / cap clamped to 0f..1f. */
        val fraction: Float
            get() = if (cap <= 0L) 0f else (spent.toFloat() / cap.toFloat()).coerceIn(0f, 1f)
    }

    data class TopCategory(val name: String, val color: String, val spent: Long, val cap: Long?)
    data class GoalItem(val name: String, val color: String, val pct: Double, val saved: Long, val target: Long)
    data class RecentItem(val date: Long, val label: String, val signedAmount: Long, val type: String)
    data class Preset(
        val id: String,
        val label: String,
        val amount: Long, // positive magnitude
        val type: String, // "expense" | "income"
        val categoryId: String?,
        val accountId: String,
    ) {
        /** Signed minor units the way the web stores a transaction. */
        val signedAmount: Long get() = if (type == "income") amount else -amount
    }

    fun formatMoney(minor: Long): String = formatMinor(minor, currency)

    companion object {
        const val PREFS_FILE = "CapacitorStorage" // @capacitor/preferences default group
        const val KEY = "pera.widget.snapshot"

        fun read(context: Context): WidgetSnapshot {
            val raw = context
                .getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                .getString(KEY, null)
            if (raw.isNullOrBlank()) return empty()
            return try {
                parse(JSONObject(raw))
            } catch (_: Throwable) {
                empty()
            }
        }

        private fun parse(o: JSONObject): WidgetSnapshot {
            val currency = o.optString("currency", "PHP")
            val top = o.optJSONObject("topAccount")
            return WidgetSnapshot(
                netWorth = o.optLong("netWorth", 0L),
                assets = o.optLong("assets", 0L),
                liabilities = o.optLong("liabilities", 0L),
                currency = currency,
                updatedAt = o.optLong("updatedAt", 0L),
                budget = o.optJSONObject("budget")?.let { parseBudget(it) },
                goals = parseGoals(o.optJSONArray("goals")),
                recent = parseRecent(o.optJSONArray("recent")),
                presets = parsePresets(o.optJSONArray("presets")),
                topAccountName = top?.optString("name"),
                topAccountBalance = top?.optLong("balance"),
                hasData = true,
            )
        }

        private fun parseBudget(b: JSONObject): Budget = Budget(
            spent = b.optLong("spent", 0L),
            cap = b.optLong("cap", 0L),
            level = b.optString("level", "ok"),
            remaining = b.optLong("remaining", 0L),
            daysLeft = b.optInt("daysLeft", 0),
            projected = b.optLong("projected", 0L),
            topCategories = (0 until (b.optJSONArray("topCategories")?.length() ?: 0)).map { i ->
                val c = b.getJSONArray("topCategories").getJSONObject(i)
                TopCategory(
                    name = c.optString("name", ""),
                    color = c.optString("color", "#9AA0AA"),
                    spent = c.optLong("spent", 0L),
                    cap = if (c.isNull("cap")) null else c.optLong("cap"),
                )
            },
        )

        private fun parseGoals(arr: JSONArray?): List<GoalItem> =
            (0 until (arr?.length() ?: 0)).map { i ->
                val g = arr!!.getJSONObject(i)
                GoalItem(
                    name = g.optString("name", ""),
                    color = g.optString("color", "#34D399"),
                    pct = g.optDouble("pct", 0.0),
                    saved = g.optLong("saved", 0L),
                    target = g.optLong("target", 0L),
                )
            }

        private fun parseRecent(arr: JSONArray?): List<RecentItem> =
            (0 until (arr?.length() ?: 0)).map { i ->
                val r = arr!!.getJSONObject(i)
                RecentItem(
                    date = r.optLong("date", 0L),
                    label = r.optString("label", ""),
                    signedAmount = r.optLong("signedAmount", 0L),
                    type = r.optString("type", "expense"),
                )
            }

        private fun parsePresets(arr: JSONArray?): List<Preset> =
            (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                val p = arr!!.getJSONObject(i)
                val account = p.optString("accountId", "")
                if (account.isEmpty()) return@mapNotNull null // nothing to post to
                Preset(
                    id = p.optString("id", ""),
                    label = p.optString("label", ""),
                    amount = p.optLong("amount", 0L),
                    type = p.optString("type", "expense"),
                    categoryId = if (p.isNull("categoryId")) null else p.optString("categoryId").ifEmpty { null },
                    accountId = account,
                )
            }

        private fun empty() = WidgetSnapshot(
            netWorth = 0L,
            assets = 0L,
            liabilities = 0L,
            currency = "PHP",
            updatedAt = 0L,
            budget = null,
            goals = emptyList(),
            recent = emptyList(),
            presets = emptyList(),
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
