// Browser-only: read a CSV/XLSX File into a raw 2D matrix via SheetJS.
// (Pure mapping of that matrix lives in importing.ts and is unit-tested.)

import * as XLSX from 'xlsx'

export async function fileToMatrix(file: File): Promise<unknown[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  }) as unknown[][]
  return matrix
}
