// Lives apart from pdf.ts (which pulls in the heavy pdfjs-dist) so callers can
// reference the error type without bundling pdfjs — pdf.ts is loaded on demand.

/** Thrown when a PDF needs a password (or the supplied one is wrong). */
export class PdfPasswordError extends Error {
  constructor(public needsPassword: boolean) {
    super('PDF is password protected')
    this.name = 'PdfPasswordError'
  }
}
