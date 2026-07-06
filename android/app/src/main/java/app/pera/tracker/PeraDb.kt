package app.pera.tracker

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.util.Log
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.json.JSONArray
import java.io.File
import java.util.Calendar
import java.util.UUID
import kotlin.math.roundToLong

/**
 * The widget's DIRECT handle on the app's SQLite file — the SAME file the
 * WebView uses via @capacitor-community/sqlite. No snapshot, no pending queue:
 * the widget reads real totals with SQL and writes real transaction rows.
 *
 * Path parity (critical): the plugin opens `context.getDatabasePath(dbName +
 * "SQLite.db")` — for connection "pera" that's `.../databases/peraSQLite.db`.
 * We open the EXACT same file, and log both so the emulator can confirm they
 * match. Engine parity too: the plugin talks to the file through net.zetetic
 * SQLCipher; with `androidIsEncryption:false` it opens with an EMPTY passphrase,
 * so the file is plain, unencrypted SQLite. We use the same SQLCipher engine +
 * empty passphrase, which (a) reads/writes that plain file and (b) shares
 * SQLite's per-process file-lock registry with the plugin's connection — so
 * concurrent access from the same process is safe. WAL is already persisted in
 * the file header by the web side; we just set busy_timeout per connection.
 */
object PeraDb {
    private const val TAG = "PeraDb"
    private const val DB_FILE = "peraSQLite.db" // plugin: name "pera" + "SQLite.db"

    // Empty bind-arg array for arg-less queries. net.zetetic's query() takes an
    // Object[] (the plugin uses the same call), so this avoids any null-overload
    // ambiguity.
    private val NO_ARGS = arrayOf<Any?>()

    @Volatile private var libsLoaded = false
    @Volatile private var cached: SQLiteDatabase? = null

    private fun dbFile(context: Context): File = context.getDatabasePath(DB_FILE)

    /**
     * Open the shared DB read-write, or null if it doesn't exist yet (fresh
     * install — the app hasn't created it). We never create it here: a schemaless
     * empty file would confuse the plugin's first-run path. A live connection is
     * cached and reused (WAL readers always see the latest committed data).
     */
    private fun open(context: Context): SQLiteDatabase? {
        cached?.let { if (it.isOpen) return it }
        val file = dbFile(context)
        if (!file.exists()) {
            Log.i(TAG, "DB not created yet — ${file.absolutePath}")
            return null
        }
        return try {
            if (!libsLoaded) {
                System.loadLibrary("sqlcipher")
                libsLoaded = true
            }
            Log.i(TAG, "opening shared DB — ${file.absolutePath}")
            val db = SQLiteDatabase.openDatabase(
                file.absolutePath, "", null, SQLiteDatabase.OPEN_READWRITE, null,
            )
            // Per-connection; avoids SQLITE_BUSY while the WebView holds the writer.
            db.query("PRAGMA busy_timeout=5000;", NO_ARGS).use { it.moveToFirst() }
            cached = db
            db
        } catch (t: Throwable) {
            Log.w(TAG, "open failed — ${t.message}")
            null
        }
    }

    private fun sel(db: SQLiteDatabase, sql: String): Cursor = db.query(sql, NO_ARGS)

    // ------------------------------------------------------------------ write ---

    /**
     * Insert a REAL transaction row (the widget quick-add Save + preset taps).
     * `signedAmount` is signed minor units (expense negative, income positive);
     * `categoryId` is the REAL id (fixes the old Food→Uncategorized drop at the
     * source). Returns true on success. No-op (false) when the DB isn't ready.
     */
    fun insertTransaction(
        context: Context,
        accountId: String,
        signedAmount: Long,
        type: String,
        categoryId: String?,
    ): Boolean {
        if (accountId.isEmpty()) return false
        return synchronized(this) {
            val db = open(context) ?: return@synchronized false
            try {
                val nowMs = System.currentTimeMillis()
                val cv = ContentValues().apply {
                    put("id", UUID.randomUUID().toString())
                    put("accountId", accountId)
                    put("amount", signedAmount)
                    put("type", type)
                    if (!categoryId.isNullOrEmpty()) put("categoryId", categoryId)
                    put("date", nowMs)
                    put("createdAt", nowMs)
                    put("updatedAt", nowMs)
                }
                db.insert("transactions", null, cv) >= 0
            } catch (t: Throwable) {
                Log.w(TAG, "insert failed — ${t.message}")
                false
            }
        }
    }

    // ------------------------------------------------------------------- read ---

    /** Build the widget render model from live SQL, or empty() when unavailable. */
    fun readSnapshot(context: Context): WidgetSnapshot = synchronized(this) {
        val db = open(context) ?: return@synchronized WidgetSnapshot.empty()
        try {
            build(db)
        } catch (t: Throwable) {
            Log.w(TAG, "read failed — ${t.message}")
            WidgetSnapshot.empty()
        }
    }

    private fun build(db: SQLiteDatabase): WidgetSnapshot {
        // Settings singleton.
        var currency = "PHP"
        var cap: Long? = null
        var defaultAccountId: String? = null
        var presetsJson: String? = null
        sel(
            db,
            "SELECT baseCurrency, monthlyBudget, defaultAccountId, quickAddPresets FROM settings WHERE id='singleton'",
        ).use { c ->
            if (c.moveToFirst()) {
                currency = c.getStringOr(0) ?: "PHP"
                cap = if (c.isNull(1)) null else c.getLong(1)
                defaultAccountId = c.getStringOr(2)
                presetsJson = c.getStringOr(3)
            }
        }

        // Visible accounts + their balances (opening + Σ non-goal txns).
        val accounts = ArrayList<WidgetSnapshot.AccountItem>()
        var netWorth = 0L
        var assets = 0L
        var liabilities = 0L
        var topName: String? = null
        var topBalance: Long? = null
        sel(
            db,
            """
            SELECT a.id, a.name, a.color,
              a.openingBalance + COALESCE(
                (SELECT SUM(t.amount) FROM transactions t WHERE t.accountId = a.id AND t.type != 'goal'), 0
              ) AS bal
            FROM accounts a WHERE a.archived = 0 ORDER BY a.sortOrder
            """.trimIndent(),
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getStringOr(0) ?: continue
                val name = c.getStringOr(1) ?: ""
                val color = c.getStringOr(2)
                val bal = c.getLong(3)
                accounts.add(WidgetSnapshot.AccountItem(id, name, color))
                netWorth += bal
                if (bal >= 0) assets += bal else liabilities += bal
                if (topBalance == null || bal > topBalance!!) {
                    topBalance = bal; topName = name
                }
            }
        }
        val validAccountIds = accounts.map { it.id }.toHashSet()

        // Categories (dialog chips).
        val categories = ArrayList<WidgetSnapshot.CategoryItem>()
        sel(db, "SELECT id, name, kind, color FROM categories").use { c ->
            while (c.moveToNext()) {
                val id = c.getStringOr(0) ?: continue
                categories.add(
                    WidgetSnapshot.CategoryItem(
                        id = id,
                        name = c.getStringOr(1) ?: "",
                        kind = c.getStringOr(2) ?: "expense",
                        color = c.getStringOr(3) ?: "#9AA0AA",
                    ),
                )
            }
        }

        // Month window [start, next) in LOCAL time — matches lib/balances.monthKey.
        val cal = Calendar.getInstance()
        val daysInMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
        val dayOfMonth = cal.get(Calendar.DAY_OF_MONTH)
        cal.set(Calendar.DAY_OF_MONTH, 1)
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0)
        val monthStart = cal.timeInMillis
        cal.add(Calendar.MONTH, 1)
        val nextMonth = cal.timeInMillis

        val budget = cap?.let { c -> buildBudget(db, c, monthStart, nextMonth, daysInMonth, dayOfMonth) }
        val goals = buildGoals(db)
        val recent = buildRecent(db)
        val presets = buildPresets(presetsJson, validAccountIds, defaultAccountId, accounts.firstOrNull()?.id)

        return WidgetSnapshot(
            netWorth = netWorth,
            assets = assets,
            liabilities = liabilities,
            currency = currency,
            updatedAt = System.currentTimeMillis(),
            budget = budget,
            goals = goals,
            recent = recent,
            presets = presets,
            accounts = accounts,
            categories = categories,
            defaultAccountId = defaultAccountId ?: accounts.firstOrNull()?.id,
            topAccountName = topName,
            topAccountBalance = topBalance,
            hasData = accounts.isNotEmpty(),
        )
    }

    private fun buildBudget(
        db: SQLiteDatabase,
        cap: Long,
        monthStart: Long,
        nextMonth: Long,
        daysInMonth: Int,
        dayOfMonth: Int,
    ): WidgetSnapshot.Budget {
        val spent = scalarLong(
            db,
            "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions " +
                "WHERE type = 'expense' AND date >= $monthStart AND date < $nextMonth",
        )
        val remaining = cap - spent
        val pct = if (cap > 0) spent.toDouble() / cap.toDouble() * 100.0
        else if (spent > 0) Double.POSITIVE_INFINITY else 0.0
        val level = if (pct > 100.0) "over" else if (pct >= 80.0) "warn" else "ok"
        val projected = if (dayOfMonth > 0)
            (spent.toDouble() / dayOfMonth.toDouble() * daysInMonth.toDouble()).roundToLong()
        else spent

        // Per-category caps, to annotate the top slices.
        val capByCat = HashMap<String, Long>()
        sel(db, "SELECT categoryId, amount FROM budgets").use { c ->
            while (c.moveToNext()) {
                val cid = c.getStringOr(0) ?: continue
                capByCat[cid] = c.getLong(1)
            }
        }

        // Top spend categories this month; NULL/unknown categoryId collapse into
        // ONE "Uncategorized" bucket (the LEFT JOIN c.id IS NULL branch).
        val top = ArrayList<WidgetSnapshot.TopCategory>()
        sel(
            db,
            """
            SELECT CASE WHEN c.id IS NULL THEN '' ELSE c.id END AS cid,
                   CASE WHEN c.id IS NULL THEN 'Uncategorized' ELSE c.name END AS cname,
                   CASE WHEN c.id IS NULL THEN '#9AA0AA' ELSE c.color END AS ccolor,
                   SUM(ABS(t.amount)) AS total
            FROM transactions t LEFT JOIN categories c ON c.id = t.categoryId
            WHERE t.type = 'expense' AND t.date >= $monthStart AND t.date < $nextMonth
            GROUP BY cid ORDER BY total DESC LIMIT 3
            """.trimIndent(),
        ).use { c ->
            while (c.moveToNext()) {
                val cid = c.getStringOr(0) ?: ""
                top.add(
                    WidgetSnapshot.TopCategory(
                        name = c.getStringOr(1) ?: "Uncategorized",
                        color = c.getStringOr(2) ?: "#9AA0AA",
                        spent = c.getLong(3),
                        cap = if (cid.isNotEmpty()) capByCat[cid] else null,
                    ),
                )
            }
        }

        return WidgetSnapshot.Budget(
            spent = spent,
            cap = cap,
            level = level,
            remaining = remaining,
            daysLeft = daysInMonth - dayOfMonth,
            projected = projected,
            topCategories = top,
        )
    }

    private fun buildGoals(db: SQLiteDatabase): List<WidgetSnapshot.GoalItem> {
        val out = ArrayList<WidgetSnapshot.GoalItem>()
        sel(
            db,
            "SELECT id, name, targetAmount, linkedAccountId, color FROM goals " +
                "WHERE archived = 0 ORDER BY createdAt LIMIT 4",
        ).use { c ->
            while (c.moveToNext()) {
                val id = c.getStringOr(0) ?: continue
                val name = c.getStringOr(1) ?: ""
                val target = c.getLong(2)
                val linked = c.getStringOr(3)
                val color = c.getStringOr(4) ?: "#34D399"
                val saved = goalSaved(db, id, linked)
                val pct = if (target > 0)
                    (saved.toDouble() / target.toDouble() * 100.0).coerceIn(0.0, 100.0)
                else if (saved > 0) 100.0 else 0.0
                out.add(WidgetSnapshot.GoalItem(name, color, pct, saved, target))
            }
        }
        return out
    }

    /** saved-so-far: a NON-archived linked account's balance, else Σ goalId txns. */
    private fun goalSaved(db: SQLiteDatabase, goalId: String, linkedAccountId: String?): Long {
        if (linkedAccountId != null) {
            var bal: Long? = null
            sel(
                db,
                "SELECT a.openingBalance + COALESCE(" +
                    "(SELECT SUM(t.amount) FROM transactions t WHERE t.accountId = a.id AND t.type != 'goal'), 0) " +
                    "FROM accounts a WHERE a.id = ${lit(linkedAccountId)} AND a.archived = 0",
            ).use { c -> if (c.moveToFirst()) bal = c.getLong(0) }
            if (bal != null) return bal!!
        }
        return scalarLong(
            db,
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE goalId = ${lit(goalId)}",
        )
    }

    private fun buildRecent(db: SQLiteDatabase): List<WidgetSnapshot.RecentItem> {
        val out = ArrayList<WidgetSnapshot.RecentItem>()
        sel(
            db,
            """
            SELECT t.date, t.note, t.type, t.amount, c.name AS cname
            FROM transactions t LEFT JOIN categories c ON c.id = t.categoryId
            WHERE t.type != 'goal' ORDER BY t.date DESC LIMIT 5
            """.trimIndent(),
        ).use { c ->
            while (c.moveToNext()) {
                val date = c.getLong(0)
                val note = c.getStringOr(1)
                val type = c.getStringOr(2) ?: "expense"
                val amount = c.getLong(3)
                val cname = c.getStringOr(4)
                val label = note?.takeIf { it.isNotBlank() }
                    ?: cname?.takeIf { it.isNotBlank() }
                    ?: typeLabel(type)
                out.add(WidgetSnapshot.RecentItem(date, label, amount, type))
            }
        }
        return out
    }

    private fun buildPresets(
        json: String?,
        validAccountIds: Set<String>,
        defaultAccountId: String?,
        firstAccountId: String?,
    ): List<WidgetSnapshot.Preset> {
        if (json.isNullOrBlank()) return emptyList()
        val arr = try {
            JSONArray(json)
        } catch (_: Throwable) {
            return emptyList()
        }
        val fallback = defaultAccountId ?: firstAccountId
        val out = ArrayList<WidgetSnapshot.Preset>()
        var i = 0
        while (i < arr.length() && out.size < 4) {
            val p = arr.optJSONObject(i); i++
            if (p == null) continue
            val pAccount = p.optString("accountId", "").ifEmpty { null }
            val account = if (pAccount != null && validAccountIds.contains(pAccount)) pAccount
            else fallback ?: ""
            if (account.isEmpty()) continue // nothing concrete to post to
            out.add(
                WidgetSnapshot.Preset(
                    id = p.optString("id", ""),
                    label = p.optString("label", ""),
                    amount = p.optLong("amount", 0L),
                    type = p.optString("type", "expense"),
                    categoryId = if (p.isNull("categoryId")) null else p.optString("categoryId").ifEmpty { null },
                    accountId = account,
                ),
            )
        }
        return out
    }

    // ---------------------------------------------------------------- helpers ---

    private fun typeLabel(type: String): String = when (type) {
        "income" -> "Income"
        "expense" -> "Expense"
        "transfer" -> "Transfer"
        "adjustment" -> "Adjustment"
        else -> "Transaction"
    }

    private fun scalarLong(db: SQLiteDatabase, sql: String): Long =
        sel(db, sql).use { if (it.moveToFirst()) it.getLong(0) else 0L }

    /** SQL string literal, single-quotes escaped. Used only for our own UUIDs. */
    private fun lit(s: String): String = "'" + s.replace("'", "''") + "'"

    private fun Cursor.getStringOr(i: Int): String? = if (isNull(i)) null else getString(i)
}
