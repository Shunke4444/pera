package app.pera.tracker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * The native "pending log" queue. A widget preset tap can't reach IndexedDB
 * (the webview isn't running), so it appends a pending transaction here. On the
 * next app launch the web app drains this queue into IndexedDB, idempotent by
 * the pending `id` (see src/lib/pending.ts + drainPendingQueue). Stored in the
 * same SharedPreferences group @capacitor/preferences reads, so the web side
 * picks it up via Preferences.get({ key: "pera.widget.pending" }).
 */
object PendingStore {
    const val KEY = "pera.widget.pending"

    /**
     * Append a pending transaction. `signedAmount` is signed minor units
     * (expense negative, income positive), `date` defaults to now.
     */
    fun enqueue(
        context: Context,
        accountId: String,
        signedAmount: Long,
        type: String,
        categoryId: String?,
    ) {
        val prefs = context.getSharedPreferences(WidgetSnapshot.PREFS_FILE, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY, null)
        val arr = try {
            if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
        } catch (_: Throwable) {
            JSONArray()
        }
        val item = JSONObject().apply {
            put("id", UUID.randomUUID().toString())
            put("accountId", accountId)
            put("amount", signedAmount)
            put("type", type)
            if (categoryId != null) put("categoryId", categoryId)
            put("date", System.currentTimeMillis())
        }
        arr.put(item)
        prefs.edit().putString(KEY, arr.toString()).apply()
    }
}
