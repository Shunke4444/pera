package app.pera.tracker

import android.os.Bundle
import com.getcapacitor.BridgeActivity

/**
 * The quick-add POP-UP: a dialog-themed, translucent Capacitor BridgeActivity
 * that loads the SAME web app as MainActivity. Because it's a BridgeActivity in
 * the same app it shares the WebView origin (https://localhost) and therefore
 * the SAME IndexedDB — so the quick-add it shows writes the real database, not a
 * separate one. It's launched with data `pera://quick-add?...&popup=1`, which
 * Capacitor surfaces as the launch URL; deepLink.ts routes to /#/quick-add and
 * AppLayout strips its chrome (popup=1). The web side calls WidgetBridge
 * .dismissPopup() after a save to finish this Activity.
 */
class QuickAddPopupActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register the bridge BEFORE super.onCreate so dismissPopup() is callable.
        registerPlugin(WidgetBridgePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
