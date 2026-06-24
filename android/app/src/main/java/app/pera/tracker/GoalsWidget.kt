package app.pera.tracker

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlin.math.roundToInt

/**
 * Goals widget: the top goal's progress (bar + %) and saved / target. Glance has
 * no arc primitive, so a coloured bar stands in for the in-app ring. Tapping
 * opens the app's Goals screen.
 */
class GoalsWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = WidgetSnapshot.read(context)
        provideContent { Content(context, snap) }
    }

    @Composable
    private fun Content(context: Context, snap: WidgetSnapshot) {
        WidgetScaffold {
            Eyebrow("Goal")
            val goal = snap.goals.firstOrNull()
            if (goal == null) {
                EmptyHint("Add a savings goal in Pera to track it here.")
                return@WidgetScaffold
            }

            Spacer(GlanceModifier.height(4.dp))
            Row(verticalAlignment = Alignment.Vertical.Bottom, modifier = GlanceModifier.fillMaxWidth()) {
                Text(
                    text = goal.name,
                    maxLines = 1,
                    style = TextStyle(color = ColorProvider(TEXT), fontSize = 18.sp, fontWeight = FontWeight.Bold),
                    modifier = GlanceModifier.defaultWeight(),
                )
                Text(
                    text = "${goal.pct.roundToInt()}%",
                    style = TextStyle(color = ColorProvider(parseColor(goal.color)), fontSize = 18.sp, fontWeight = FontWeight.Bold),
                )
            }

            Spacer(GlanceModifier.height(8.dp))
            LinearProgressIndicator(
                progress = (goal.pct / 100.0).toFloat().coerceIn(0f, 1f),
                modifier = GlanceModifier.fillMaxWidth().height(10.dp).cornerRadius(5.dp),
                color = ColorProvider(parseColor(goal.color)),
                backgroundColor = ColorProvider(BORDER),
            )

            Spacer(GlanceModifier.height(8.dp))
            Text(
                text = "${snap.formatMoney(goal.saved)} of ${snap.formatMoney(goal.target)}",
                style = TextStyle(color = ColorProvider(MUTED), fontSize = 12.sp),
            )

            if (snap.goals.size > 1) {
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    text = "+${snap.goals.size - 1} more goal${if (snap.goals.size - 1 == 1) "" else "s"}",
                    style = TextStyle(color = ColorProvider(DIM), fontSize = 11.sp),
                )
            }

            Spacer(GlanceModifier.defaultWeight())
            Row(
                modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivity(openAppIntent(context))),
            ) {
                Text(
                    text = "Open Pera →",
                    style = TextStyle(color = ColorProvider(ACCENT), fontSize = 11.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.End),
                    modifier = GlanceModifier.fillMaxWidth(),
                )
            }
        }
    }
}

class GoalsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = GoalsWidget()
}
