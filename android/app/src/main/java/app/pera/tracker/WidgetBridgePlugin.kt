package app.pera.tracker

import androidx.glance.appwidget.updateAll
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * JS-callable bridge: WidgetBridge.refresh() forces every Pera widget to
 * recompose from the freshly published snapshot. Called by the web app right
 * after it writes the snapshot to Preferences (a save / app start).
 */
@CapacitorPlugin(name = "WidgetBridge")
class WidgetBridgePlugin : Plugin() {
    @PluginMethod
    fun refresh(call: PluginCall) {
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                PeraWidget().updateAll(appContext)
            } catch (_: Throwable) {
                /* no widgets placed / transient — ignore */
            }
        }
        call.resolve()
    }
}
