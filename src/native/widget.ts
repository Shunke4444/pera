import { registerPlugin } from '@capacitor/core'

// JS side of the native WidgetBridge plugin (Android: WidgetBridgePlugin.kt).
// refresh() forces every placed Pera widget to recompose from the latest
// snapshot; dismissPopup() finishes the quick-add pop-up Activity. No-op /
// unavailable on web — callers guard with isNativePlatform.
export interface WidgetBridgePlugin {
  refresh(): Promise<void>
  dismissPopup(): Promise<void>
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')
