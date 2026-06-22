// Per-bank PDF parser profiles. PDF text extraction (pdfjs) lives in pdf.ts;
// this module is the PURE line→row logic so it can be unit-tested.
//
// GCash/Maya use the generic single-line parser. Maribank + AUB HelloMoney use a
// grouping parser (parseSignedAmountRows) because their statement rows stack
// several fields across separate y-grouped text lines, in a bank-specific order
// (AUB: date first; Maribank: title/type before the date). See the per-bank
// regexes below; field *semantics* are fixed even if pdf text order shifts.

import { parseMajorInput } from './money'
import { startOfDay } from './dates'
import { parseDateCell, type ParsedRow } from './importing'

const MONEY_RE = /-?₱?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g
const ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/
const MDY_RE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/
const MMMDY_RE = /\b[A-Z][a-z]{2}\.?\s+\d{1,2},?\s+\d{4}\b/

const DEBIT_KW = /(payment|purchase|sent|send money|transfer to|withdraw|debit|bills|buy load|pay qr|qr ph|paid)/i
const CREDIT_KW = /(received|cash in|cash-in|refund|deposit|credit|salary|added|top[\s-]?up|reversal|received money)/i

function lineDate(line: string): number | null {
  const tok =
    line.match(ISO_RE)?.[0] ?? line.match(MDY_RE)?.[0] ?? line.match(MMMDY_RE)?.[0]
  return tok ? parseDateCell(tok) : null
}

function moneyToMinor(tok: string): number {
  const minor = parseMajorInput(tok.replace(/₱/g, ''))
  return minor == null ? 0 : Math.abs(minor)
}

export type Direction = 'expense' | 'income'

export interface ProfileOptions {
  /** Default direction when no keyword resolves it. */
  defaultDirection?: Direction
}

/**
 * Generic statement-line parser: a line is a transaction when it has a date and
 * at least one money token. The first money token is taken as the amount (the
 * trailing token, if any, is the running balance). Direction comes from
 * keywords, else the default.
 */
export function parseStatementLines(
  lines: string[],
  opts: ProfileOptions = {},
): ParsedRow[] {
  const out: ParsedRow[] = []
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line) continue
    const date = lineDate(line)
    if (date == null) continue
    const amounts = line.match(MONEY_RE)
    if (!amounts || amounts.length === 0) continue

    const mag = moneyToMinor(amounts[0])
    if (mag === 0) continue

    const dir: Direction = CREDIT_KW.test(line)
      ? 'income'
      : DEBIT_KW.test(line)
        ? 'expense'
        : (opts.defaultDirection ?? 'expense')

    // Description = line minus the date token and the money tokens.
    let desc = line
    const dateTok = line.match(ISO_RE)?.[0] ?? line.match(MDY_RE)?.[0] ?? line.match(MMMDY_RE)?.[0]
    if (dateTok) desc = desc.replace(dateTok, ' ')
    desc = desc.replace(MONEY_RE, ' ').replace(/\s+/g, ' ').trim()

    out.push({
      date,
      amount: dir === 'expense' ? -mag : mag,
      type: dir,
      description: desc,
    })
  }
  return out
}

// ------------------------------------------------ grouped multi-line parsers ---

// Column-header / page-furniture lines that must never be folded into a row's
// description. Anchored at the start so real payees ("Payroll Credit") survive.
const NOISE_RE =
  /^(transaction history|statement of account|e-?statement|account (no|number)|page \d|balance|date|description|amount|debit|credit|withdrawal|deposit)\b/i

// Any peso amount/balance token (with or without sign / PHP / ₱) — stripped from
// descriptions so neither the amount nor the running balance leaks into them.
const ANY_MONEY_RE = /[+\-]?\s*(?:PHP|₱)?\s*\d{1,3}(?:,\d{3})*\.\d{2}/gi

interface BankSpec {
  /** Matches the row's datetime token, with capture groups for `toDate`. */
  dateRe: RegExp
  toDate: (m: RegExpMatchArray) => number | null
  /** Captures [_, sign, value]. MUST require an explicit +/- so the unsigned
   *  running balance can never be mistaken for the amount. */
  amountRe: RegExp
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function cleanDesc(joined: string, dateTok: string | undefined): string {
  let s = joined
  if (dateTok) s = s.split(dateTok).join(' ')
  return s
    .replace(ANY_MONEY_RE, ' ')
    .replace(/\bPHP\b/gi, ' ')
    .replace(/₱/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Group consecutive text lines into transactions, using the SIGNED AMOUNT as the
 * row terminator. Because the running balance is unsigned, it can never close a
 * row — it simply gets stripped from the next row's description. This survives
 * both single-line ("date payee amount balance") and stacked layouts, and any
 * field order, as long as each row ends with its signed amount.
 */
export function parseSignedAmountRows(lines: string[], spec: BankSpec): ParsedRow[] {
  const out: ParsedRow[] = []
  let buf: string[] = []
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || NOISE_RE.test(line)) continue
    buf.push(line)
    const joined = buf.join(' ')
    const am = joined.match(spec.amountRe)
    if (!am) continue // amount not seen yet → keep accumulating this row

    const dm = joined.match(spec.dateRe)
    const date = dm ? spec.toDate(dm) : null
    const minor = parseMajorInput(am[2])
    if (date != null && minor != null && minor !== 0) {
      const income = am[1] === '+'
      const mag = Math.abs(minor)
      out.push({
        date,
        amount: income ? mag : -mag,
        type: income ? 'income' : 'expense',
        description: cleanDesc(joined, dm?.[0]),
      })
    }
    buf = [] // reset; a trailing balance line will start (and be stripped from) the next row
  }
  return out
}

// AUB HelloMoney: "MM/DD/YYYY h:mm am/pm" + a signed "- 7,492.00" amount.
const AUB_DATE_RE = /(\d{2})\/(\d{2})\/(\d{4})\s+\d{1,2}:\d{2}\s*(?:am|pm)/i
const AUB_AMOUNT_RE = /([+\-])\s*([\d,]+\.\d{2})/

export function parseAubLines(lines: string[]): ParsedRow[] {
  return parseSignedAmountRows(lines, {
    dateRe: AUB_DATE_RE,
    amountRe: AUB_AMOUNT_RE,
    toDate: (m) => startOfDay(new Date(+m[3], +m[1] - 1, +m[2]).getTime()), // MM/DD/YYYY
  })
}

// Maribank: "DD Mon YYYY, HH:MM" (24h) + a signed "+PHP 2.00" amount.
const MARI_DATE_RE = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+\d{2}:\d{2}/
const MARI_AMOUNT_RE = /([+\-])\s*PHP\s*([\d,]+\.\d{2})/i

export function parseMaribankLines(lines: string[]): ParsedRow[] {
  return parseSignedAmountRows(lines, {
    dateRe: MARI_DATE_RE,
    amountRe: MARI_AMOUNT_RE,
    toDate: (m) => {
      const mon = MONTHS[m[2].toLowerCase()]
      return mon == null ? null : startOfDay(new Date(+m[3], mon, +m[1]).getTime())
    },
  })
}

export interface PdfProfile {
  id: string
  label: string
  /** Whether this bank's PDFs are typically password-protected. */
  passwordProtected: boolean
  parse: (lines: string[]) => ParsedRow[]
}

export const PDF_PROFILES: PdfProfile[] = [
  {
    id: 'gcash',
    label: 'GCash',
    passwordProtected: true,
    parse: (lines) => parseStatementLines(lines, { defaultDirection: 'expense' }),
  },
  {
    id: 'maya',
    label: 'Maya',
    passwordProtected: false,
    parse: (lines) => parseStatementLines(lines, { defaultDirection: 'expense' }),
  },
  {
    id: 'maribank',
    label: 'Maribank',
    passwordProtected: false,
    parse: parseMaribankLines,
  },
  {
    // AUB e-statements can be password-locked; the flag reuses the GCash prompt.
    id: 'aub',
    label: 'AUB HelloMoney',
    passwordProtected: true,
    parse: parseAubLines,
  },
  {
    id: 'generic',
    label: 'Generic (auto)',
    passwordProtected: false,
    parse: (lines) => parseStatementLines(lines),
  },
]

export function profileById(id: string): PdfProfile {
  return PDF_PROFILES.find((p) => p.id === id) ?? PDF_PROFILES[PDF_PROFILES.length - 1]
}
