package app.pera.tracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * The NATIVE typed quick-add: a dialog-themed Compose Activity (no WebView, no
 * Capacitor boot) that opens instantly over the home screen. Amount number-pad +
 * account + category chips + Save. On Save it writes to the SAME native queue as
 * the preset instant-log (PendingStore.enqueue + SnapshotStore.applyOptimisticLog
 * + refreshAllWidgets); the web app reconciles it into IndexedDB on next launch
 * (idempotent drain). Replaces QuickAddPopupActivity as the primary "+" path.
 */
class QuickAddNativeActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val snap = WidgetSnapshot.read(applicationContext)
        val initialType = intent.getStringExtra(EXTRA_TYPE) ?: "expense"

        setContent {
            Scrim(onDismiss = { finish() }) {
                QuickAddCard(
                    snap = snap,
                    initialType = initialType,
                    onCancel = { finish() },
                    onSave = { accountId, signed, type, label ->
                        PendingStore.enqueue(applicationContext, accountId, signed, type, label)
                        SnapshotStore.applyOptimisticLog(applicationContext, signed, type, label)
                        CoroutineScope(Dispatchers.Default).launch {
                            try {
                                refreshAllWidgets(applicationContext)
                            } catch (_: Throwable) {
                                /* no widgets placed — ignore */
                            }
                        }
                        finish()
                    },
                )
            }
        }
    }
}

/** Full-screen dimmed tap-catcher: tapping outside the card dismisses. */
@Composable
private fun Scrim(onDismiss: () -> Unit, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0x99000000))
            .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) { onDismiss() },
        contentAlignment = Alignment.Center,
    ) {
        // The card swallows taps so they don't fall through to the scrim.
        Box(
            modifier = Modifier
                .padding(20.dp)
                .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
        ) { content() }
    }
}

@Composable
private fun QuickAddCard(
    snap: WidgetSnapshot,
    initialType: String,
    onCancel: () -> Unit,
    onSave: (accountId: String, signed: Long, type: String, label: String?) -> Unit,
) {
    var type by remember { mutableStateOf(if (initialType == "income") "income" else "expense") }
    var amountText by remember { mutableStateOf("") }
    var accountId by remember {
        mutableStateOf(snap.defaultAccountId ?: snap.accounts.firstOrNull()?.id ?: "")
    }
    var categoryId by remember { mutableStateOf<String?>(null) }

    val minor = parseMinor(amountText)
    val cats = snap.categories.filter { it.kind == type }
    val canSave = minor > 0L && accountId.isNotEmpty()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(SURFACE)
            .border(1.dp, BORDER, RoundedCornerShape(20.dp))
            .padding(18.dp),
    ) {
        Text("QUICK ADD", color = DIM, fontSize = 10.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(8.dp))

        // Expense / income toggle.
        Row(modifier = Modifier.fillMaxWidth()) {
            TypeTab("Expense", selected = type == "expense", accent = NEG, modifier = Modifier.weight(1f)) {
                type = "expense"; categoryId = null
            }
            Spacer(Modifier.width(8.dp))
            TypeTab("Income", selected = type == "income", accent = POS, modifier = Modifier.weight(1f)) {
                type = "income"; categoryId = null
            }
        }

        Spacer(Modifier.height(14.dp))

        // Amount display.
        Text(
            text = snap.formatMoney(minor),
            color = if (type == "expense") NEG else POS,
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))

        NumberPad(
            onDigit = { d -> amountText = appendDigit(amountText, d) },
            onDot = { amountText = appendDot(amountText) },
            onBackspace = { amountText = amountText.dropLast(1) },
        )

        if (snap.accounts.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Label("ACCOUNT")
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            ) {
                snap.accounts.forEach { a ->
                    Chip(
                        text = a.name,
                        selected = a.id == accountId,
                        dot = a.color,
                        onClick = { accountId = a.id },
                    )
                    Spacer(Modifier.width(8.dp))
                }
            }
        }

        if (cats.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Label("CATEGORY")
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            ) {
                Chip(text = "None", selected = categoryId == null, dot = null) { categoryId = null }
                Spacer(Modifier.width(8.dp))
                cats.forEach { c ->
                    Chip(
                        text = c.name,
                        selected = c.id == categoryId,
                        dot = c.color,
                        onClick = { categoryId = c.id },
                    )
                    Spacer(Modifier.width(8.dp))
                }
            }
        }

        Spacer(Modifier.height(18.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            TextButton("Cancel", modifier = Modifier.weight(1f), onClick = onCancel)
            Spacer(Modifier.width(10.dp))
            FilledButton(
                text = "Save",
                enabled = canSave,
                modifier = Modifier.weight(1f),
                onClick = {
                    val signed = if (type == "income") minor else -minor
                    val label = cats.firstOrNull { it.id == categoryId }?.name
                    onSave(accountId, signed, type, label)
                },
            )
        }
    }
}

// ---- pieces --------------------------------------------------------------- //

@Composable
private fun Label(text: String) =
    Text(text, color = DIM, fontSize = 10.sp, fontWeight = FontWeight.Medium)

@Composable
private fun TypeTab(
    text: String,
    selected: Boolean,
    accent: Color,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .height(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, if (selected) accent else BORDER, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (selected) accent else MUTED, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun NumberPad(onDigit: (Char) -> Unit, onDot: () -> Unit, onBackspace: () -> Unit) {
    val rows = listOf(
        listOf("1", "2", "3"),
        listOf("4", "5", "6"),
        listOf("7", "8", "9"),
        listOf(".", "0", "⌫"),
    )
    Column(modifier = Modifier.fillMaxWidth()) {
        rows.forEach { row ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                row.forEachIndexed { i, key ->
                    if (i > 0) Spacer(Modifier.width(8.dp))
                    Key(key, modifier = Modifier.weight(1f)) {
                        when (key) {
                            "." -> onDot()
                            "⌫" -> onBackspace()
                            else -> onDigit(key[0])
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Key(label: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(46.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(SURFACE2)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = TEXT, fontSize = 18.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun Chip(text: String, selected: Boolean, dot: String?, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (selected) SURFACE2 else SURFACE)
            .border(1.dp, if (selected) ACCENT else BORDER, RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (dot != null) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(parseColor(dot)),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(text, color = if (selected) TEXT else MUTED, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun FilledButton(text: String, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(46.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (enabled) ACCENT else BORDER)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (enabled) BG else DIM, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun TextButton(text: String, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(46.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, BORDER, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = MUTED, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

// ---- amount helpers (mirror lib/money.ts parseMajorInput) ----------------- //

/** Typed major-unit text → integer minor units (centavos); 0 for empty/garbage. */
private fun parseMinor(text: String): Long {
    if (text.isEmpty() || text == ".") return 0L
    val n = text.toDoubleOrNull() ?: return 0L
    return Math.round(n * 100.0)
}

/** Append a digit, blocking a leading run of zeros and >2 decimal places. */
private fun appendDigit(text: String, d: Char): String {
    if (text == "0") return d.toString() // replace a lone leading zero
    val dot = text.indexOf('.')
    if (dot >= 0 && text.length - dot > 2) return text // already 2 decimals
    if (text.length >= 12) return text
    return text + d
}

/** Append a decimal point once. */
private fun appendDot(text: String): String {
    if (text.contains('.')) return text
    return if (text.isEmpty()) "0." else "$text."
}
