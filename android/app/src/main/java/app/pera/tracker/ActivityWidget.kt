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
import androidx.glance.appwidget.action.actionStartActivity
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

/**
 * Activity widget: the last few transactions (label + signed amount). Tapping
 * opens the app. Read-only — the quick-log lives on the Budget / Net-worth ones.
 */
class ActivityWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = WidgetSnapshot.read(context)
        provideContent { Content(context, snap) }
    }

    @Composable
    private fun Content(context: Context, snap: WidgetSnapshot) {
        WidgetScaffold {
            Row(
                modifier = GlanceModifier.fillMaxWidth().clickable(actionStartActivity(openAppIntent(context))),
            ) {
                Text(
                    text = "RECENT",
                    style = TextStyle(color = ColorProvider(DIM), fontSize = 10.sp, fontWeight = FontWeight.Medium),
                    modifier = GlanceModifier.defaultWeight(),
                )
                Text(
                    text = "Open →",
                    style = TextStyle(color = ColorProvider(ACCENT), fontSize = 10.sp, fontWeight = FontWeight.Medium),
                )
            }

            if (snap.recent.isEmpty()) {
                EmptyHint("Your latest transactions show up here.")
                return@WidgetScaffold
            }

            snap.recent.take(4).forEach { r ->
                Spacer(GlanceModifier.height(8.dp))
                Row(verticalAlignment = Alignment.Vertical.CenterVertically, modifier = GlanceModifier.fillMaxWidth()) {
                    Text(
                        text = r.label,
                        maxLines = 1,
                        style = TextStyle(color = ColorProvider(TEXT), fontSize = 13.sp),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    Spacer(GlanceModifier.height(1.dp))
                    Text(
                        text = signed(snap, r.signedAmount),
                        style = TextStyle(
                            color = ColorProvider(if (r.signedAmount >= 0) POS else TEXT),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.End,
                        ),
                    )
                }
            }
        }
    }

    private fun signed(snap: WidgetSnapshot, minor: Long): String {
        val sign = if (minor > 0) "+" else if (minor < 0) "−" else ""
        return sign + snap.formatMoney(if (minor < 0) -minor else minor)
    }
}

class ActivityWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ActivityWidget()
}
