package app.pera.tracker

import android.content.Context
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * The widget render model. It used to be parsed from a JSON snapshot the web app
 * published; since 032 the widget reads the app's SQLite file DIRECTLY, so
 * `read()` just delegates to [PeraDb.readSnapshot] which builds this from live
 * SQL (net worth, this month's budget + top categories, goals, recent txns and
 * the quick-add presets). All money is integer minor units (centavos).
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
    val accounts: List<AccountItem>,
    val categories: List<CategoryItem>,
    val defaultAccountId: String?,
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

    /** An account chip for the native quick-add dialog. */
    data class AccountItem(val id: String, val name: String, val color: String?)

    /** A category chip for the native quick-add dialog (kind = expense | income). */
    data class CategoryItem(val id: String, val name: String, val kind: String, val color: String)

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
        /** Read live data from the shared SQLite file (empty on a fresh install). */
        fun read(context: Context): WidgetSnapshot = PeraDb.readSnapshot(context)

        fun empty() = WidgetSnapshot(
            netWorth = 0L,
            assets = 0L,
            liabilities = 0L,
            currency = "PHP",
            updatedAt = 0L,
            budget = null,
            goals = emptyList(),
            recent = emptyList(),
            presets = emptyList(),
            accounts = emptyList(),
            categories = emptyList(),
            defaultAccountId = null,
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
