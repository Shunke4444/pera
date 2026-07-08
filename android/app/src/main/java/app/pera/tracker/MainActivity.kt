package app.pera.tracker

import android.os.Bundle
import android.util.Log
import com.getcapacitor.BridgeActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register the JS-callable bridge BEFORE super.onCreate so it's available
        // when the webview loads.
        registerPlugin(WidgetBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
        // Hourly WorkManager fallback so the widget never goes very stale even if
        // the app isn't opened (the in-app publisher handles the live case).
        WidgetRefreshScheduler.ensureScheduled(applicationContext)
        // Immediately refresh placed widgets at startup so they show live data
        // without waiting for the first WorkManager tick.
        CoroutineScope(Dispatchers.Default).launch {
            try {
                refreshAllWidgets(applicationContext)
            } catch (t: Throwable) {
                Log.w("WidgetRefresh", "startup refresh failed — ${t.message}")
            }
        }
    }
}
