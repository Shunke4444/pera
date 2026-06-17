import { useMemo, useState } from 'react'
import { Upload, FileSpreadsheet, FileText, Undo2, CheckCircle2 } from 'lucide-react'
import { useAccounts, useCategories } from '../hooks'
import { fileToMatrix } from '../lib/spreadsheet'
import { pdfToLines, PdfPasswordError } from '../lib/pdf'
import { PDF_PROFILES, profileById } from '../lib/pdfProfiles'
import {
  parseMatrix,
  dedupeRows,
  type ColumnMapping,
  type ParsedRow,
  type AmountSign,
} from '../lib/importing'
import { commitImport, undoImport, getAccountImportHashes, type ImportResult } from '../db/repo'
import { formatSignedPHP, parseMajorInput } from '../lib/money'
import { Button, Field, Input, Select } from '../ui/form'
import { Eyebrow, EmptyState, SectionTitle } from '../ui/common'

type Source = 'sheet' | 'pdf'

const COL_OPTIONS = (matrix: unknown[][]) => {
  const header = matrix[0] ?? []
  const width = matrix.reduce((w, r) => Math.max(w, r?.length ?? 0), 0)
  return Array.from({ length: width }, (_, i) => ({
    index: i,
    label: String(header[i] ?? `Column ${i + 1}`),
  }))
}

function guessMapping(matrix: unknown[][]): ColumnMapping {
  const header = (matrix[0] ?? []).map((h) => String(h).toLowerCase())
  const find = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h))
    return i >= 0 ? i : fallback
  }
  const looksLikeHeader = header.some((h) => /date|amount|desc|type|debit|credit/.test(h))
  return {
    date: find(/date/, 0),
    amount: find(/amount|debit|credit|value/, 1),
    description: find(/desc|narrative|detail|particular|merchant|remark|reference/, 2),
    type: header.findIndex((h) => /type|dr.?cr|direction/.test(h)) >= 0
      ? header.findIndex((h) => /type|dr.?cr|direction/.test(h))
      : undefined,
    hasHeader: looksLikeHeader,
    amountSign: 'signed',
  }
}

export default function Import() {
  const accounts = useAccounts()
  const categories = useCategories()

  const [accountId, setAccountId] = useState('')
  const [source, setSource] = useState<Source>('sheet')
  const [profileId, setProfileId] = useState('gcash')
  const [password, setPassword] = useState('')
  const [needPassword, setNeedPassword] = useState(false)

  const [matrix, setMatrix] = useState<unknown[][] | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [pdfRows, setPdfRows] = useState<ParsedRow[] | null>(null)
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set())

  const [categoryId, setCategoryId] = useState('')
  const [endingBalance, setEndingBalance] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const acct = accountId || accounts[0]?.id || ''

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (source === 'sheet' && matrix && mapping) return parseMatrix(matrix, mapping)
    if (source === 'pdf' && pdfRows) return pdfRows
    return []
  }, [source, matrix, mapping, pdfRows])

  const dedupe = useMemo(
    () => dedupeRows(parsedRows, acct, existingHashes),
    [parsedRows, acct, existingHashes],
  )

  const reset = () => {
    setMatrix(null)
    setMapping(null)
    setPdfRows(null)
    setResult(null)
    setError('')
    setNeedPassword(false)
    setEndingBalance('')
  }

  const onSheetFile = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const m = await fileToMatrix(file)
      if (m.length === 0) {
        setError('No rows found in that file.')
      } else {
        setMatrix(m)
        setMapping(guessMapping(m))
        setExistingHashes(await getAccountImportHashes(acct))
      }
    } catch {
      setError('Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const onPdfFile = async (file: File, pw?: string) => {
    setBusy(true)
    setError('')
    try {
      const lines = await pdfToLines(file, pw)
      const rows = profileById(profileId).parse(lines)
      if (rows.length === 0) {
        setError('No transactions detected. Try a different bank profile or use CSV/Excel.')
      }
      setPdfRows(rows)
      setNeedPassword(false)
      setExistingHashes(await getAccountImportHashes(acct))
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setNeedPassword(true)
        setError('This PDF needs a password.')
      } else {
        setError('Could not read that PDF.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Keep the file handle so a late password entry can re-run extraction.
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const commit = async () => {
    setBusy(true)
    try {
      const res = await commitImport(acct, parsedRows, {
        categoryId: categoryId || undefined,
        endingBalance: endingBalance.trim() ? parseMajorInput(endingBalance) ?? undefined : undefined,
      })
      setResult(res)
    } finally {
      setBusy(false)
    }
  }

  const undo = async () => {
    if (result) {
      await undoImport(result.batchId)
      reset()
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="space-y-4">
        <SectionTitle>Import</SectionTitle>
        <EmptyState title="Add an account first" hint="Imports land in one of your accounts." />
      </div>
    )
  }

  // ---- result screen ----
  if (result) {
    return (
      <div className="space-y-5">
        <SectionTitle>Import complete</SectionTitle>
        <div className="rounded-card border border-border bg-surface p-5 text-center">
          <CheckCircle2 className="mx-auto text-pos" size={36} />
          <p className="mt-2 font-display text-2xl font-bold">{result.added} added</p>
          <p className="text-sm text-muted">{result.skipped} skipped as duplicates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={undo}>
            <span className="inline-flex items-center gap-1.5">
              <Undo2 size={15} /> Undo this import
            </span>
          </Button>
          <Button className="flex-1" onClick={reset}>
            Import another
          </Button>
        </div>
      </div>
    )
  }

  const hasData = source === 'sheet' ? !!matrix : !!pdfRows

  return (
    <div className="space-y-5">
      <SectionTitle>Import statements</SectionTitle>

      {/* Account + source */}
      <div className="space-y-3">
        <Field label="Import into">
          <Select value={acct} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          {(['sheet', 'pdf'] as Source[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s)
                reset()
              }}
              className={`flex items-center justify-center gap-2 rounded-tile border px-3 py-2.5 text-sm font-semibold ${
                source === s ? 'border-accent text-accent' : 'border-border text-muted'
              }`}
            >
              {s === 'sheet' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
              {s === 'sheet' ? 'CSV / Excel' : 'PDF'}
            </button>
          ))}
        </div>

        {source === 'pdf' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bank profile">
              <Select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {PDF_PROFILES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            {(needPassword || profileById(profileId).passwordProtected) && (
              <Field label="PDF password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Surname + last 4"
                />
              </Field>
            )}
          </div>
        )}
      </div>

      {/* File picker */}
      {!hasData && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-4 py-8 text-center">
          <Upload size={22} className="text-muted" />
          <span className="text-sm font-medium">
            {busy ? 'Reading…' : `Choose a ${source === 'sheet' ? '.csv / .xlsx' : '.pdf'} file`}
          </span>
          <span className="text-xs text-dim">Reviewed before anything is saved</span>
          <input
            type="file"
            accept={source === 'sheet' ? '.csv,.xlsx,.xls' : 'application/pdf'}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              if (source === 'sheet') onSheetFile(f)
              else {
                setPdfFile(f)
                onPdfFile(f, password || undefined)
              }
            }}
          />
        </label>
      )}

      {needPassword && pdfFile && (
        <Button onClick={() => onPdfFile(pdfFile, password)} disabled={!password}>
          Unlock & read
        </Button>
      )}

      {error && <p className="text-sm text-neg">{error}</p>}

      {/* Column mapping (spreadsheet) */}
      {source === 'sheet' && matrix && mapping && (
        <MappingStep matrix={matrix} mapping={mapping} onChange={setMapping} />
      )}

      {/* Preview + commit */}
      {hasData && parsedRows.length >= 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <Eyebrow>Preview</Eyebrow>
            <span className="text-xs text-muted">
              {dedupe.fresh.length} new · {dedupe.duplicates.length} duplicate
            </span>
          </div>

          {parsedRows.length === 0 ? (
            <EmptyState
              title="Nothing to import"
              hint="No rows could be parsed. Check the column mapping or file."
            />
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-card border border-border bg-surface">
              {dedupe.fresh.slice(0, 50).map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3.5 py-2 text-sm ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <span className="w-20 flex-none text-xs text-dim">
                    {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.description || '—'}</span>
                  <span
                    className={`flex-none font-display font-bold tabular-nums ${
                      r.amount >= 0 ? 'text-pos' : 'text-neg'
                    }`}
                  >
                    {formatSignedPHP(r.amount)}
                  </span>
                </div>
              ))}
              {dedupe.fresh.length > 50 && (
                <p className="border-t border-border px-3.5 py-2 text-center text-xs text-dim">
                  + {dedupe.fresh.length - 50} more
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="Default category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Statement ending balance">
              <Input
                inputMode="decimal"
                value={endingBalance}
                onChange={(e) => setEndingBalance(e.target.value)}
                placeholder="Optional — reconciles"
              />
            </Field>
          </div>

          <Button onClick={commit} disabled={busy || dedupe.fresh.length === 0} className="w-full">
            {busy ? 'Importing…' : `Import ${dedupe.fresh.length} transaction${dedupe.fresh.length === 1 ? '' : 's'}`}
          </Button>
        </section>
      )}
    </div>
  )
}

function MappingStep({
  matrix,
  mapping,
  onChange,
}: {
  matrix: unknown[][]
  mapping: ColumnMapping
  onChange: (m: ColumnMapping) => void
}) {
  const cols = COL_OPTIONS(matrix)
  const set = (patch: Partial<ColumnMapping>) => onChange({ ...mapping, ...patch })
  const colSelect = (
    value: number | undefined,
    onSel: (v: number | undefined) => void,
    allowNone = false,
  ) => (
    <Select
      value={value ?? ''}
      onChange={(e) => onSel(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      {allowNone && <option value="">— None —</option>}
      {cols.map((c) => (
        <option key={c.index} value={c.index}>
          {c.label}
        </option>
      ))}
    </Select>
  )

  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4">
      <Eyebrow>Map columns</Eyebrow>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date column">{colSelect(mapping.date, (v) => set({ date: v ?? 0 }))}</Field>
        <Field label="Amount column">{colSelect(mapping.amount, (v) => set({ amount: v ?? 0 }))}</Field>
        <Field label="Description">{colSelect(mapping.description, (v) => set({ description: v ?? 0 }))}</Field>
        <Field label="Type (optional)">{colSelect(mapping.type, (v) => set({ type: v }), true)}</Field>
      </div>
      <Field label="How are amounts signed?">
        <Select
          value={mapping.amountSign}
          onChange={(e) => set({ amountSign: e.target.value as AmountSign })}
        >
          <option value="signed">Signed (− is expense)</option>
          <option value="expense">All are expenses</option>
          <option value="income">All are income</option>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mapping.hasHeader}
          onChange={(e) => set({ hasHeader: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        First row is a header
      </label>
    </section>
  )
}
