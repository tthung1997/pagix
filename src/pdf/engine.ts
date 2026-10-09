import { EncryptedPDFError, PDFDocument } from 'pdf-lib'
import { zipSync } from 'fflate'
import { PdfError, type ExportRequest, type ExportResult, type PageRef, type Progress } from './types'

export type GetBytes = (sourceId: string) => Promise<Uint8Array>
const HEADER = '%PDF-'

const isEncryptedError = (error: unknown) =>
  error instanceof EncryptedPDFError ||
  (error instanceof Error && (error.constructor.name === 'EncryptedPDFError' || /is encrypted/i.test(error.message)))

function hasPdfHeader(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes(HEADER)
}

export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number }> {
  if (bytes.byteLength === 0) throw new PdfError('empty', 'The file is empty.')
  if (!hasPdfHeader(bytes)) throw new PdfError('not-pdf', 'The file is not a PDF document.')
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (error) {
    if (isEncryptedError(error)) {
      throw new PdfError('encrypted', 'The PDF is password-protected, which Pagix does not support.')
    }
    throw new PdfError('malformed', 'The PDF is damaged or uses an unsupported structure.')
  }
  const pageCount = doc.getPageCount()
  if (pageCount === 0) throw new PdfError('malformed', 'The PDF contains no pages.')
  return { pageCount }
}

async function loadSource(id: string, getBytes: GetBytes): Promise<PDFDocument> {
  const bytes = await getBytes(id)
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false })
  } catch (error) {
    if (isEncryptedError(error)) {
      throw new PdfError('encrypted', 'A source PDF is password-protected.')
    }
    throw new PdfError('malformed', 'A source PDF could not be read again for export.')
  }
}

export async function buildPart(
  pages: PageRef[],
  getDoc: (sourceId: string) => Promise<PDFDocument>,
  onPage?: () => void,
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  out.setProducer('Pagix')
  out.setCreator('Pagix')
  let i = 0
  while (i < pages.length) {
    const sourceId = pages[i]!.sourceId
    let j = i
    while (j < pages.length && pages[j]!.sourceId === sourceId) j++
    const run = pages.slice(i, j)
    const src = await getDoc(sourceId)
    const copied = await out.copyPages(src, run.map((p) => p.pageIndex))
    for (const page of copied) {
      out.addPage(page)
      onPage?.()
    }
    i = j
  }
  return out.save()
}

export async function runExport(
  request: ExportRequest,
  getBytes: GetBytes,
  onProgress?: Progress,
): Promise<ExportResult> {
  const total = request.parts.reduce((n, p) => n + p.pages.length, 0) + 1
  if (request.parts.length === 0 || total === 1) throw new PdfError('failed', 'There are no pages to export.')
  let done = 0
  const tick = () => onProgress?.(++done, total)

  const docs = new Map<string, Promise<PDFDocument>>()
  const getDoc = (id: string) => {
    let doc = docs.get(id)
    if (!doc) {
      doc = loadSource(id, getBytes)
      docs.set(id, doc)
    }
    return doc
  }

  const outputs: { filename: string; bytes: Uint8Array }[] = []
  for (const part of request.parts) {
    outputs.push({ filename: part.filename, bytes: await buildPart(part.pages, getDoc, tick) })
  }

  if (request.kind === 'merged') {
    const only = outputs[0]!
    tick()
    return { bytes: only.bytes, filename: only.filename, mime: 'application/pdf' }
  }

  const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
  for (const { filename, bytes } of outputs) entries[filename] = [bytes, { level: 0 }]
  const zipped = zipSync(entries)
  tick()
  return { bytes: zipped, filename: 'pagix-split.zip', mime: 'application/zip' }
}
