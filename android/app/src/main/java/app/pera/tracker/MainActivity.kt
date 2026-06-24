package app.pera.tracker

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register the JS-callable bridge BEFORE super.onCreate so it's available
        // when the webview loads.
        registerPlugin(WidgetBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
        // Hourly WorkManager fallback so the widget never goes very stale even if
        // the app isn't opened (the in-app publisher handles the live case).
        WidgetRefreshScheduler.ensureScheduled(applicationContext)
    }
}
