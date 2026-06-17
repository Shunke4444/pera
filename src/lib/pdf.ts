// Browser-only: extract text lines from a (possibly password-protected) PDF
// using pdfjs-dist. Line grouping is by y-position so columns stay on one line.
// Per-bank parsing of those lines lives in pdfProfiles.ts (unit-tested).

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Thrown when a PDF needs a password (or the supplied one is wrong). */
export class PdfPasswordError extends Error {
  constructor(public needsPassword: boolean) {
    super('PDF is password protected')
    this.name = 'PdfPasswordError'
  }
}

export async function pdfToLines(file: File, password?: string): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  let doc
  try {
    doc = await pdfjsLib.getDocument({ data, password }).promise
  } catch (e: unknown) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') throw new PdfPasswordError(true)
    throw e
  }

  const lines: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const byRow = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      const x = item.transform[4]
      if (!byRow.has(y)) byRow.set(y, [])
      byRow.get(y)!.push({ x, str: item.str })
    }
    const ys = [...byRow.keys()].sort((a, b) => b - a) // top to bottom
    for (const y of ys) {
      const line = byRow
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((c) => c.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) lines.push(line)
    }
  }
  return lines
}
