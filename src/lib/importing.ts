// Pure import helpers: hashing for dedup, and turning a raw spreadsheet matrix
// + a column mapping into typed, signed transactions. No Dexie / SheetJS here.

import { toMinor, parseMajorInput } from './money'
import { startOfDay } from './dates'
import type { TransactionType } from '../db/types'

export type AmountSign = 'signed' | 'expense' | 'income'

export interface ColumnMapping {
  date: number
  amount: number
  description: number
  type?: number // optional column whose text says debit/credit
  hasHeader: boolean
  amountSign: AmountSign // used when no type column resolves the direction
}

export interface ParsedRow {
  date: number // epoch ms (local midnight)
  amount: number // signed minor units
  type: TransactionType // 'income' | 'expense'
  description: string
}

/** Collapse whitespace + lowercase so trivial format diffs don't dodge dedup. */
export function normalizeDesc(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stable dedup key: account + day + amount + normalized description (djb2). */
export function importHash(
  accountId: string,
  date: number,
  amount: number,
  description: string,
): string {
  const key = `${accountId}|${startOfDay(date)}|${amount}|${normalizeDesc(description)}`
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 33) + key.charCodeAt(i)) | 0
  return 'ih_' + (h >>> 0).toString(36)
}

const EXCEL_EPOCH_DAYS = 25569 // days between 1899-12-30 and 1970-01-01

/** Best-effort cell → epoch ms. Handles Excel serials, Dates and common strings. */
export function parseDateCell(cell: unknown): number | null {
  if (cell == null || cell === '') return null
  if (cell instanceof Date) return startOfDay(cell.getTime())
  if (typeof cell === 'number') {
    // Excel serial date (days since 1899-12-30).
    if (cell > 59 && cell < 60000) {
      return startOfDay((cell - EXCEL_EPOCH_DAYS) * 86400000)
    }
    return startOfDay(cell)
  }
  const s = String(cell).trim()
  // Numeric D/M/Y or M/D/Y: first group >12 ⇒ day-first; second >12 ⇒ month-
  // first; otherwise assume month-first (common in PH bank CSV exports).
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const g1 = Number(m[1])
    const g2 = Number(m[2])
    let year = Number(m[3])
    if (year < 100) year += 2000
    let day: number
    let mon: number
    if (g1 > 12) {
      day = g1
      mon = g2
    } else if (g2 > 12) {
      mon = g1
      day = g2
    } else {
      mon = g1
      day = g2
    }
    const t = new Date(year, mon - 1, day)
    if (!isNaN(t.getTime())) return startOfDay(t.getTime())
  }
  const parsed = Date.parse(s)
  return isNaN(parsed) ? null : startOfDay(parsed)
}

/** Cell → minor units magnitude (unsigned). Numbers are treated as major units. */
export function parseAmountCell(cell: unknown): number | null {
  if (cell == null || cell === '') return null
  if (typeof cell === 'number') return Math.abs(toMinor(cell))
  const minor = parseMajorInput(String(cell))
  return minor == null ? null : Math.abs(minor)
}

const DEBIT_RE = /(debit|expense|withdraw|out|paid|purchase|dr\b|-)/i
const CREDIT_RE = /(credit|income|deposit|received|in\b|cr\b|refund|\+)/i

/** Decide income/expense from an optional type cell, else from amountSign. */
function resolveDirection(
  rawAmountText: string,
  typeText: string | undefined,
  amountSign: AmountSign,
): 'income' | 'expense' {
  if (typeText) {
    if (CREDIT_RE.test(typeText)) return 'income'
    if (DEBIT_RE.test(typeText)) return 'expense'
  }
  if (amountSign === 'income') return 'income'
  if (amountSign === 'expense') return 'expense'
  // 'signed': respect a leading minus in the raw amount text.
  return /^\s*-/.test(rawAmountText) ? 'expense' : 'income'
}

/**
 * Turn a 2D matrix + mapping into typed rows. Rows whose date or amount can't be
 * parsed are skipped. Header row is dropped when mapping.hasHeader is set.
 */
export function parseMatrix(matrix: unknown[][], mapping: ColumnMapping): ParsedRow[] {
  const body = mapping.hasHeader ? matrix.slice(1) : matrix
  const out: ParsedRow[] = []
  for (const row of body) {
    if (!row || row.length === 0) continue
    const date = parseDateCell(row[mapping.date])
    const mag = parseAmountCell(row[mapping.amount])
    if (date == null || mag == null) continue
    const rawAmt = String(row[mapping.amount] ?? '')
    const typeText = mapping.type != null ? String(row[mapping.type] ?? '') : undefined
    const dir = resolveDirection(rawAmt, typeText, mapping.amountSign)
    const description = String(row[mapping.description] ?? '').trim()
    out.push({
      date,
      amount: dir === 'expense' ? -mag : mag,
      type: dir,
      description,
    })
  }
  return out
}

export interface DedupeResult {
  fresh: ParsedRow[]
  duplicates: ParsedRow[]
}

/** Split parsed rows into fresh vs already-present, by importHash against accountId. */
export function dedupeRows(
  rows: ParsedRow[],
  accountId: string,
  existingHashes: Set<string>,
): DedupeResult {
  const fresh: ParsedRow[] = []
  const duplicates: ParsedRow[] = []
  const seen = new Set(existingHashes)
  for (const r of rows) {
    const h = importHash(accountId, r.date, r.amount, r.description)
    if (seen.has(h)) {
      duplicates.push(r)
    } else {
      seen.add(h) // also dedup within the same file
      fresh.push(r)
    }
  }
  return { fresh, duplicates }
}
