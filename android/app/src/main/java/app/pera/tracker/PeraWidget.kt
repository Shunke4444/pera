package app.pera.tracker

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.format.DateUtils
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.defaultWeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

// App palette (002-style.md, dark theme) — native, not web tokens.
private val BG = Color(0xFF0B0C10)
private val SURFACE = Color(0xFF14161D)
private val BORDER = Color(0xFF20232C)
private val TEXT = Color(0xFFF4F5F7)
private val MUTED = Color(0xFF9AA0AA)
private val DIM = Color(0xFF7E848E)
private val ACCENT = Color(0xFF34D399) // emerald
private val WARN = Color(0xFFFBBF24)
private val NEG = Color(0xFFF87171)

/** Explicit deep-link intent into MainActivity → Capacitor appUrlOpen → /#/quick-add. */
private fun quickAddIntent(context: Context, type: String): Intent =
    Intent(
        Intent.ACTION_VIEW,
        Uri.parse("pera://quick-add?type=$type"),
        context,
        MainActivity::class.java,
    ).apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }

class PeraWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = WidgetSnapshot.read(context)
        provideContent { Content(context, snap) }
    }

    @Composable
    private fun Content(context: Context, snap: WidgetSnapshot) {
        Column(
            modifier = GlanceModifier.fillMaxSize().background(BG).padding(14.dp),
        ) {
            Text(
                text = "NET WORTH",
                style = TextStyle(color = ColorProvider(DIM), fontSize = 10.sp, fontWeight = FontWeight.Medium),
            )
            Text(
                text = if (snap.hasData) snap.formatMoney(snap.netWorth) else "—",
                style = TextStyle(color = ColorProvider(TEXT), fontSize = 26.sp, fontWeight = FontWeight.Bold),
            )

            Spacer(GlanceModifier.height(10.dp))

            if (snap.monthBudgetCap != null) {
                Row(modifier = GlanceModifier.fillMaxWidth()) {
                    Text(
                        text = "This month",
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    Text(
                        text = "${snap.formatMoney(snap.monthBudgetSpent)} / ${snap.formatMoney(snap.monthBudgetCap)}",
                        style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp, textAlign = TextAlign.End),
                    )
                }
                Spacer(GlanceModifier.height(4.dp))
                val over = snap.monthBudgetSpent > snap.monthBudgetCap
                val near = !over && snap.budgetFraction >= 0.8f
                val barColor = if (over) NEG else if (near) WARN else ACCENT
                LinearProgressIndicator(
                    progress = snap.budgetFraction,
                    modifier = GlanceModifier.fillMaxWidth().height(8.dp),
                    color = ColorProvider(barColor),
                    backgroundColor = ColorProvider(BORDER),
                )
            } else {
                Text(
                    text = "No monthly budget set",
                    style = TextStyle(color = ColorProvider(MUTED), fontSize = 11.sp),
                )
            }

            Spacer(GlanceModifier.defaultWeight())

            Row(modifier = GlanceModifier.fillMaxWidth()) {
                ActionButton(
                    label = "+ Expense",
                    modifier = GlanceModifier.defaultWeight()
                        .clickable(actionStartActivity(quickAddIntent(context, "expense"))),
                )
                Spacer(GlanceModifier.width(8.dp))
                ActionButton(
                    label = "+ Income",
                    modifier = GlanceModifier.defaultWeight()
                        .clickable(actionStartActivity(quickAddIntent(context, "income"))),
                )
            }

            if (snap.hasData && snap.updatedAt > 0L) {
                Spacer(GlanceModifier.height(6.dp))
                Text(
                    text = "Updated " + DateUtils.getRelativeTimeSpanString(snap.updatedAt),
                    style = TextStyle(color = ColorProvider(DIM), fontSize = 9.sp),
                )
            }
        }
    }

    @Composable
    private fun ActionButton(label: String, modifier: GlanceModifier) {
        Box(
            modifier = modifier.background(ACCENT).height(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                style = TextStyle(color = ColorProvider(BG), fontSize = 14.sp, fontWeight = FontWeight.Bold),
            )
        }
    }
}
