package app.pera.tracker

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/**
 * Flagship widget: this month's spend vs cap with a bar, remaining + days left,
 * a couple of top categories, then preset buttons + a "+" pop-up. Reads the
 * published snapshot; instant-logs via the preset buttons.
 */
class BudgetWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = WidgetSnapshot.read(context)
        provideContent { Content(context, snap) }
    }

    @Composable
    private fun Content(context: Context, snap: WidgetSnapshot) {
        WidgetScaffold {
            Eyebrow("Budget · this month")
            val b = snap.budget
            if (b == null) {
                EmptyHint("Set a monthly budget in Pera to track it here.")
                return@WidgetScaffold
            }

            Spacer(GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.Vertical.Bottom, modifier = GlanceModifier.fillMaxWidth()) {
                Text(
                    text = snap.formatMoney(b.spent),
                    style = TextStyle(color = ColorProvider(TEXT), fontSize = 24.sp, fontWeight = FontWeight.Bold),
                )
                Text(
                    text = " / ${snap.formatMoney(b.cap)}",
                    style = TextStyle(color = ColorProvider(DIM), fontSize = 14.sp),
                )
            }

            Spacer(GlanceModifier.height(8.dp))
            BudgetBar(b)
            Spacer(GlanceModifier.height(6.dp))
            Row(modifier = GlanceModifier.fillMaxWidth()) {
                Text(
                    text = if (b.remaining >= 0) "${snap.formatMoney(b.remaining)} left"
                    else "${snap.formatMoney(-b.remaining)} over",
                    style = TextStyle(
                        color = ColorProvider(if (b.remaining >= 0) MUTED else NEG),
                        fontSize = 11.sp,
                    ),
                    modifier = GlanceModifier.defaultWeight(),
                )
                Text(
                    text = "${b.daysLeft}d left",
                    style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp, textAlign = TextAlign.End),
                )
            }

            // Top categories (up to two) — keeps the flagship readable, not busy.
            b.topCategories.take(2).forEach { c ->
                Spacer(GlanceModifier.height(6.dp))
                Row(verticalAlignment = Alignment.Vertical.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
                    Box(
                        modifier = GlanceModifier.size(8.dp).cornerRadius(4.dp).background(parseColor(c.color)),
                    ) {}
                    Spacer(GlanceModifier.width(6.dp))
                    Text(
                        text = c.name,
                        maxLines = 1,
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    Text(
                        text = snap.formatMoney(c.spent),
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                    )
                }
            }

            Spacer(GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.height(8.dp))
            ActionRow(context, snap.presets)
        }
    }
}

class BudgetWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BudgetWidget()
}
