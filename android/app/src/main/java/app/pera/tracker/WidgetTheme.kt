package app.pera.tracker

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
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

// App palette (002-style.md, dark theme) — native, not web tokens. Top-level so
// every widget in the package shares them without imports.
internal val BG = Color(0xFF0B0C10)
internal val SURFACE = Color(0xFF14161D)
internal val SURFACE2 = Color(0xFF1A1D26)
internal val BORDER = Color(0xFF20232C)
internal val TEXT = Color(0xFFF4F5F7)
internal val MUTED = Color(0xFF9AA0AA)
internal val DIM = Color(0xFF7E848E)
internal val ACCENT = Color(0xFF34D399) // emerald
internal val WARN = Color(0xFFFBBF24)
internal val NEG = Color(0xFFF87171)
internal val POS = Color(0xFF34D399)

/** Parse a "#RRGGBB" web color; fall back to the muted dot color. */
internal fun parseColor(hex: String?): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (_: Throwable) {
    MUTED
}

internal fun budgetBarColor(level: String): Color = when (level) {
    "over" -> NEG
    "warn" -> WARN
    else -> ACCENT
}

/** Root container for every widget: dark bg, generous padding (was cramped).
 *  Content runs in ColumnScope so widgets can use defaultWeight() to push the
 *  action row to the bottom. */
@Composable
internal fun WidgetScaffold(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = GlanceModifier.fillMaxSize().background(BG).cornerRadius(16.dp).padding(16.dp),
    ) { content() }
}

@Composable
internal fun Eyebrow(text: String) {
    Text(
        text = text.uppercase(),
        style = TextStyle(color = ColorProvider(DIM), fontSize = 10.sp, fontWeight = FontWeight.Medium),
    )
}

/** The emerald "+" that opens the native typed quick-add dialog (no WebView). */
@Composable
internal fun AddButton(type: String, label: String, modifier: GlanceModifier) {
    Box(
        modifier = modifier
            .background(ACCENT)
            .cornerRadius(10.dp)
            .height(40.dp)
            .clickable(
                actionRunCallback<OpenQuickAddAction>(actionParametersOf(KEY_TYPE to type)),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = TextStyle(color = ColorProvider(BG), fontSize = 13.sp, fontWeight = FontWeight.Bold),
        )
    }
}

/** A one-tap instant-log preset button (no UI; inserts a real row into SQLite). */
@Composable
internal fun PresetButton(preset: WidgetSnapshot.Preset, modifier: GlanceModifier) {
    Box(
        modifier = modifier
            .background(SURFACE2)
            .cornerRadius(10.dp)
            .height(40.dp)
            .clickable(
                actionRunCallback<LogPresetAction>(
                    actionParametersOf(
                        KEY_AMOUNT to preset.signedAmount,
                        KEY_TYPE to preset.type,
                        KEY_ACCOUNT to preset.accountId,
                        KEY_CATEGORY to (preset.categoryId ?: ""),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = preset.label,
            maxLines = 1,
            style = TextStyle(color = ColorProvider(TEXT), fontSize = 12.sp, fontWeight = FontWeight.Medium),
        )
    }
}

/**
 * The action row at the bottom of the flagship widgets: up to two presets then a
 * "+" for the typed pop-up. Presets come from the snapshot (Settings → presets).
 */
@Composable
internal fun ActionRow(presets: List<WidgetSnapshot.Preset>) {
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        presets.take(2).forEach { p ->
            PresetButton(p, GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.width(8.dp))
        }
        AddButton("expense", "+", GlanceModifier.width(48.dp))
    }
}

@Composable
internal fun BudgetBar(budget: WidgetSnapshot.Budget) {
    LinearProgressIndicator(
        progress = budget.fraction,
        modifier = GlanceModifier.fillMaxWidth().height(8.dp).cornerRadius(4.dp),
        color = ColorProvider(budgetBarColor(budget.level)),
        backgroundColor = ColorProvider(BORDER),
    )
}

@Composable
internal fun EmptyHint(text: String) {
    Box(
        modifier = GlanceModifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = TextStyle(color = ColorProvider(MUTED), fontSize = 12.sp, textAlign = TextAlign.Center),
        )
    }
}
