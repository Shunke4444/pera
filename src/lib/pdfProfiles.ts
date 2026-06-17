// Per-bank PDF parser profiles. PDF text extraction (pdfjs) lives in pdf.ts;
// this module is the PURE line→row logic so it can be unit-tested.
//
// NOTE: real bank statement layouts vary and these are tuned from typical
// GCash/Maya exports. GCash + Maya are implemented; Maribank + AUB fall back to
// the generic parser until real samples are available.
// TODO(p7): tune Maribank + AUB profiles against real statements.

import { parseMajorInput } from './money'
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
    // TODO(p7): real Maribank layout — generic parser for now.
    id: 'maribank',
    label: 'Maribank (beta)',
    passwordProtected: false,
    parse: (lines) => parseStatementLines(lines, { defaultDirection: 'expense' }),
  },
  {
    // TODO(p7): real AUB HelloMoney layout — generic parser for now.
    id: 'aub',
    label: 'AUB HelloMoney (beta)',
    passwordProtected: false,
    parse: (lines) => parseStatementLines(lines, { defaultDirection: 'expense' }),
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
