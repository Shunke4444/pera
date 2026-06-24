import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  Pencil,
  Archive,
  ArchiveRestore,
  Plus,
  Upload,
  Download,
  FileJson,
  FileSpreadsheet,
  Trash2,
  Smartphone,
  LayoutGrid,
} from 'lucide-react'
import { useAllAccounts, useTransactions, useCategories, useSettings } from '../hooks'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { accountBalance } from '../lib/balances'
import { formatPHP } from '../lib/money'
import {
  archiveAccount,
  exportData,
  importData,
  clearAllData,
  markBackedUp,
  setThemePref,
  setDefaultAccount,
} from '../db/repo'
import { seedIfEmpty } from '../db/seed'
import { transactionsToCSV, daysSinceBackup } from '../lib/backup'
import { downloadText, readFileText, stampedName } from '../lib/download'
import { applyTheme, getStoredTheme, type Theme } from '../theme'
import type { Account } from '../db/types'
import Modal from '../ui/Modal'
import AccountForm from '../components/AccountForm'
import CategoryManager from '../components/CategoryManager'
import RecurringManager from '../components/RecurringManager'
import PresetManager from '../components/PresetManager'
import { useRecurring } from '../hooks'
import { Button, Select } from '../ui/form'
import { Dot, Eyebrow, SectionTitle } from '../ui/common'

export default function Settings() {
  const accounts = useAllAccounts()
  const txns = useTransactions()
  const categories = useCategories()
  const settings = useSettings()
  const { canInstall, promptInstall } = useInstallPrompt()
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [managingCats, setManagingCats] = useState(false)
  const [managingRecurring, setManagingRecurring] = useState(false)
  const [managingPresets, setManagingPresets] = useState(false)
  const recurring = useRecurring()
  const isNative = Capacitor.isNativePlatform()
  const presetCount = settings?.quickAddPresets?.length ?? 0
  const [msg, setMsg] = useState('')
  const [theme, setThemeState] = useState<Theme>(getStoredTheme())
  const [showArchived, setShowArchived] = useState(
    () => localStorage.getItem('pera-show-archived') === '1',
  )

  const archivedCount = accounts.filter((a) => a.archived).length
  const shownAccounts = accounts.filter((a) => showArchived || !a.archived)

  const toggleShowArchived = () => {
    const next = !showArchived
    setShowArchived(next)
    localStorage.setItem('pera-show-archived', next ? '1' : '0')
  }

  const exportJSON = async () => {
    const data = await exportData()
    downloadText(stampedName('pera-backup', 'json'), JSON.stringify(data, null, 2))
    await markBackedUp()
    setMsg('Backup downloaded.')
  }

  const exportCSV = async () => {
    const csv = transactionsToCSV(txns, accounts, categories)
    downloadText(stampedName('pera-transactions', 'csv'), csv, 'text/csv')
    setMsg('CSV downloaded.')
  }

  const importJSON = async (file: File) => {
    if (!window.confirm('Restore will replace all data on this device. Continue?')) return
    try {
      const data = JSON.parse(await readFileText(file))
      await importData(data)
      setMsg('Backup restored.')
    } catch {
      setMsg('That file is not a valid Pera backup.')
    }
  }

  const clearData = async () => {
    if (!window.confirm('Erase ALL data on this device? This cannot be undone.')) return
    await clearAllData()
    await seedIfEmpty()
    setMsg('All data cleared.')
  }

  const setTheme = (t: Theme) => {
    applyTheme(t)
    setThemeState(t)
    void setThemePref(t)
  }

  const lastBackup = daysSinceBackup(settings?.lastBackupAt, Date.now())

  return (
    <div className="space-y-6">
      <SectionTitle>Settings</SectionTitle>

      {canInstall && (
        <button
          onClick={promptInstall}
          className="flex w-full items-center gap-3 rounded-card border border-accent/40 bg-surface px-3.5 py-3 text-sm font-medium"
        >
          <Smartphone size={16} className="text-accent" />
          <span className="flex-1 text-left">Install Pera on this device</span>
          <span className="text-accent">Install</span>
        </button>
      )}

      {/* Theme */}
      <section className="space-y-2">
        <Eyebrow>Appearance</Eyebrow>
        <div className="grid grid-cols-3 gap-2">
          {(['light', 'dark', 'system'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-tile border px-3 py-2 text-sm font-semibold capitalize ${
                theme === t ? 'border-accent text-accent' : 'border-border text-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Accounts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Accounts</Eyebrow>
          <div className="flex items-center gap-3">
            {archivedCount > 0 && (
              <button
                onClick={toggleShowArchived}
                className="text-xs font-semibold text-muted hover:text-text"
              >
                {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
              </button>
            )}
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {shownAccounts.map((a, i) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 px-3.5 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              } ${a.archived ? 'opacity-60' : ''}`}
            >
              <Dot color={a.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.name}
                  {a.archived && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-warn">
                      Archived
                    </span>
                  )}
                </p>
                <p className="text-xs text-dim">{formatPHP(accountBalance(a, txns))}</p>
              </div>
              <button
                onClick={() => setEditing(a)}
                aria-label={`Edit ${a.name}`}
                className="rounded-pill p-1.5 text-muted hover:text-text"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => archiveAccount(a.id, !a.archived)}
                aria-label={a.archived ? `Unarchive ${a.name}` : `Archive ${a.name}`}
                className="rounded-pill p-1.5 text-muted hover:text-text"
              >
                {a.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Quick add */}
      <section className="space-y-2">
        <Eyebrow>Quick add</Eyebrow>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Default account for quick add</span>
          <Select
            value={settings?.defaultAccountId ?? ''}
            onChange={(e) => {
              void setDefaultAccount(e.target.value || undefined)
              setMsg('Default quick-add account saved.')
            }}
          >
            <option value="">First account</option>
            {accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </label>

        {/* Home-screen widget presets — one-tap log buttons. */}
        <button
          onClick={() => setManagingPresets(true)}
          className="flex w-full items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 text-sm font-medium"
        >
          <span className="inline-flex items-center gap-2">
            <LayoutGrid size={15} className="text-muted" /> Widget quick-add presets
          </span>
          <span className="text-xs text-dim">{presetCount}</span>
        </button>

        {isNative && (
          <div className="rounded-card border border-warn/40 bg-surface px-3.5 py-3">
            <p className="text-sm font-medium text-text">Xiaomi / MIUI / HyperOS</p>
            <p className="mt-1 text-xs text-muted">
              So the widget pop-up and instant preset-logging can open while Pera is closed,
              enable these once in Android Settings → Apps → Pera → Permissions:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted">
              <li>“Display pop-up windows while running in background”</li>
              <li>“Start in background” / Autostart</li>
              <li>Battery saver → “No restrictions”</li>
            </ul>
          </div>
        )}

        <div className="rounded-card border border-border bg-surface px-3.5 py-3">
          <p className="text-sm font-medium text-text">Quick add on iPhone</p>
          <p className="mt-1 text-xs text-muted">
            iOS has no app-icon shortcuts. Make an Apple Shortcut (“Open URL”) with one of these,
            then add it to the Home Screen or bind it to Back Tap:
          </p>
          {(['expense', 'income'] as const).map((t) => {
            const url = `${window.location.origin}/#/quick-add?type=${t}`
            return (
              <div key={t} className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-tile border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-muted">
                  {url}
                </code>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(url)
                    setMsg(`Copied ${t} quick-add link.`)
                  }}
                  className="flex-none text-xs font-semibold text-accent"
                >
                  Copy
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Categories */}
      <section className="space-y-2">
        <Eyebrow>Categories</Eyebrow>
        <button
          onClick={() => setManagingCats(true)}
          className="flex w-full items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 text-sm font-medium"
        >
          <span>Manage categories</span>
          <span className="text-xs text-dim">{categories.length}</span>
        </button>
      </section>

      {/* Recurring */}
      <section className="space-y-2">
        <Eyebrow>Recurring</Eyebrow>
        <button
          onClick={() => setManagingRecurring(true)}
          className="flex w-full items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 text-sm font-medium"
        >
          <span>Recurring & upcoming bills</span>
          <span className="text-xs text-dim">{recurring.length}</span>
        </button>
      </section>

      {/* Backup */}
      <section className="space-y-2">
        <Eyebrow>Backup & data</Eyebrow>
        <p className="text-xs text-muted">
          {lastBackup === null
            ? 'Not backed up yet — export a copy so clearing your browser can’t wipe it.'
            : lastBackup === 0
              ? 'Last backup: today.'
              : `Last backup: ${lastBackup} day${lastBackup === 1 ? '' : 's'} ago.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={exportJSON}>
            <span className="inline-flex items-center gap-1.5">
              <Download size={15} /> Export JSON
            </span>
          </Button>
          <Button variant="ghost" onClick={exportCSV}>
            <span className="inline-flex items-center gap-1.5">
              <FileSpreadsheet size={15} /> Export CSV
            </span>
          </Button>
        </div>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-tile border border-border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-surface-2">
          <FileJson size={15} /> Restore from JSON backup
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJSON(f)
            }}
          />
        </label>
        <Link
          to="/import"
          className="flex items-center gap-3 rounded-tile border border-border bg-surface px-3.5 py-2.5 text-sm font-medium"
        >
          <Upload size={15} className="text-muted" /> Import bank statements
        </Link>
        <Button variant="danger" className="w-full" onClick={clearData}>
          <span className="inline-flex items-center gap-1.5">
            <Trash2 size={15} /> Clear all data
          </span>
        </Button>
        {msg && <p className="text-sm text-accent">{msg}</p>}
      </section>

      <section className="space-y-2">
        <Eyebrow>About</Eyebrow>
        <div className="rounded-card border border-border bg-surface px-3.5 py-3 text-sm text-muted">
          <p className="text-text">Pera</p>
          <p className="mt-1">
            Free, open-source, on-device money tracker. Your data never leaves this device.
          </p>
        </div>
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add account">
        <AccountForm onDone={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit account">
        {editing && <AccountForm account={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={managingCats} onClose={() => setManagingCats(false)} title="Manage categories">
        <CategoryManager />
      </Modal>
      <Modal
        open={managingRecurring}
        onClose={() => setManagingRecurring(false)}
        title="Recurring & upcoming"
      >
        <RecurringManager />
      </Modal>
      <Modal
        open={managingPresets}
        onClose={() => setManagingPresets(false)}
        title="Widget quick-add presets"
      >
        <PresetManager />
      </Modal>
    </div>
  )
}
