package app.pera.tracker

import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * JS-callable bridge:
 *  - WidgetBridge.refresh()      → recompose every Pera widget from the freshly
 *    published snapshot (called right after the web app writes it).
 *  - WidgetBridge.dismissPopup() → finish the quick-add pop-up Activity (called
 *    by the web quick-add after a save when running in popup mode).
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun refresh(call: PluginCall) {
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                refreshAllWidgets(appContext)
            } catch (t: Throwable) {
                Log.w("WidgetBridge", "refreshAllWidgets failed — ${t.message}")
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun dismissPopup(call: PluginCall) {
        val act = activity
        act?.runOnUiThread { act.finish() }
        call.resolve()
    }
}
