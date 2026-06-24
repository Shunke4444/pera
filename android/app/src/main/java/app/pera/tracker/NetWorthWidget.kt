package app.pera.tracker

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/**
 * Home widget: net worth headline + a mini budget line, then preset buttons and
 * the "+" pop-up. The everyday "where am I + log something" widget.
 */
class NetWorthWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = WidgetSnapshot.read(context)
        provideContent { Content(context, snap) }
    }

    @Composable
    private fun Content(context: Context, snap: WidgetSnapshot) {
        WidgetScaffold {
            Eyebrow("Net worth")
            Text(
                text = if (snap.hasData) snap.formatMoney(snap.netWorth) else "—",
                style = TextStyle(color = ColorProvider(TEXT), fontSize = 28.sp, fontWeight = FontWeight.Bold),
            )

            Spacer(GlanceModifier.height(8.dp))
            val b = snap.budget
            if (b != null) {
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Text(
                        text = "This month",
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    Text(
                        text = "${snap.formatMoney(b.spent)} / ${snap.formatMoney(b.cap)}",
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp, textAlign = TextAlign.End),
                    )
                }
                Spacer(GlanceModifier.height(5.dp))
                BudgetBar(b)
            } else {
                Text(
                    text = "No monthly budget set",
                    style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                )
            }

            Spacer(GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.height(8.dp))
            ActionRow(context, snap.presets)
        }
    }
}

class NetWorthWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NetWorthWidget()
}
