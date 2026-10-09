export type PdfErrorCode = 'empty' | 'not-pdf' | 'encrypted' | 'malformed' | 'cancelled' | 'failed'

export class PdfError extends Error {
  readonly code: PdfErrorCode
  constructor(code: PdfErrorCode, message: string) {
    super(message)
    this.name = 'PdfError'
    this.code = code
  }
}

export interface PageRef {
  sourceId: string
  /** Zero-based page index inside the source document. */
  pageIndex: number
}

export interface PartSpec {
  filename: string
  pages: PageRef[]
}

export interface ExportRequest {
  kind: 'merged' | 'split'
  parts: PartSpec[]
}

export interface ExportResult {
  bytes: Uint8Array
  filename: string
  mime: string
}

export type Progress = (done: number, total: number) => void

export const partFilename = (index: number) => `pagix-part-${String(index + 1).padStart(3, '0')}.pdf`
