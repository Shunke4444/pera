package app.pera.tracker

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/** The AppWidgetProvider the system talks to; delegates rendering to PeraWidget. */
class PeraWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PeraWidget()
}
