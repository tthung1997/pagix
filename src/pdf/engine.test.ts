import { PDFDocument } from 'pdf-lib'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { inspectPdf, runExport } from './engine'
import { PdfError, partFilename, type ExportRequest } from './types'
import { labelledPdf, makeEncryptedLookingPdf, makePdf } from '../test/fixtures'

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false })
  const doc = await task.promise
  const texts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    texts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(''))
  }
  await task.destroy()
  return texts
}

describe('inspectPdf', () => {
  it('reports the page count of a valid PDF', async () => {
    expect(await inspectPdf(await labelledPdf('A', 4))).toEqual({ pageCount: 4 })
  })

  it('accepts a valid PDF regardless of its filename or MIME type', async () => {
    expect((await inspectPdf(await labelledPdf('A', 1))).pageCount).toBe(1)
  })

  it.each([
    ['empty', new Uint8Array(), 'empty'],
    ['text', new TextEncoder().encode('hello world'), 'not-pdf'],
    ['truncated', new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<'), 'malformed'],
  ])('rejects %s input', async (_label, bytes, code) => {
    await expect(inspectPdf(bytes)).rejects.toMatchObject({ name: 'PdfError', code })
  })

  it('rejects encrypted PDFs instead of ignoring encryption', async () => {
    await expect(inspectPdf(await makeEncryptedLookingPdf())).rejects.toMatchObject({ code: 'encrypted' })
  })
})

describe('runExport', () => {
  const sources = async () => {
    const files: Record<string, Uint8Array> = {
      a: await makePdf([
        { text: 'A1', width: 200, height: 300 },
        { text: 'A2', width: 210, height: 310, rotate: 90 },
        { text: 'A3', width: 220, height: 320 },
      ]),
      b: await labelledPdf('B', 2),
    }
    return async (id: string) => {
      const bytes = files[id]
      if (!bytes) throw new Error('missing source')
      return bytes
    }
  }

  const request = (kind: 'merged' | 'split', groups: { sourceId: string; pageIndex: number }[][]): ExportRequest => ({
    kind,
    parts:
      kind === 'merged'
        ? [{ filename: 'pagix-merged.pdf', pages: groups.flat() }]
        : groups.map((pages, i) => ({ filename: partFilename(i), pages })),
  })

  it('merges pages across sources in the requested order, copying real content', async () => {
    const getBytes = await sources()
    const result = await runExport(
      request('merged', [[
        { sourceId: 'b', pageIndex: 1 },
        { sourceId: 'a', pageIndex: 0 },
        { sourceId: 'a', pageIndex: 2 },
        { sourceId: 'b', pageIndex: 0 },
      ]]),
      getBytes,
    )
    expect(result.filename).toBe('pagix-merged.pdf')
    expect(result.mime).toBe('application/pdf')
    expect(await pageTexts(result.bytes)).toEqual(['B2', 'A1', 'A3', 'B1'])
  })

  it('preserves page dimensions and rotation', async () => {
    const getBytes = await sources()
    const result = await runExport(
      request('merged', [[{ sourceId: 'a', pageIndex: 2 }, { sourceId: 'a', pageIndex: 1 }]]),
      getBytes,
    )
    const doc = await PDFDocument.load(result.bytes)
    const [first, second] = doc.getPages()
    expect(first!.getSize()).toEqual({ width: 220, height: 320 })
    expect(second!.getSize()).toEqual({ width: 210, height: 310 })
    expect(second!.getRotation().angle).toBe(90)
  })

  it('does not rasterize page content', async () => {
    const getBytes = await sources()
    const result = await runExport(request('merged', [[{ sourceId: 'a', pageIndex: 0 }]]), getBytes)
    expect(await pageTexts(result.bytes)).toEqual(['A1'])
    const doc = await PDFDocument.load(result.bytes)
    expect(doc.context.enumerateIndirectObjects().some(([, obj]) => String(obj).includes('/Subtype /Image'))).toBe(false)
  })

  it('builds a ZIP with one validated PDF per part and safe, predictable names', async () => {
    const getBytes = await sources()
    const result = await runExport(
      request('split', [
        [{ sourceId: 'a', pageIndex: 1 }, { sourceId: 'b', pageIndex: 0 }],
        [{ sourceId: 'a', pageIndex: 0 }],
        [{ sourceId: 'b', pageIndex: 1 }, { sourceId: 'a', pageIndex: 2 }],
      ]),
      getBytes,
    )
    expect(result.mime).toBe('application/zip')
    expect(result.filename).toBe('pagix-split.zip')
    const entries = unzipSync(result.bytes)
    expect(Object.keys(entries)).toEqual(['pagix-part-001.pdf', 'pagix-part-002.pdf', 'pagix-part-003.pdf'])
    expect(Object.keys(entries).every((name) => !name.includes('/') && !name.includes('\\'))).toBe(true)
    expect(await pageTexts(entries['pagix-part-001.pdf']!)).toEqual(['A2', 'B1'])
    expect(await pageTexts(entries['pagix-part-002.pdf']!)).toEqual(['A1'])
    expect(await pageTexts(entries['pagix-part-003.pdf']!)).toEqual(['B2', 'A3'])
  })

  it('reports progress up to completion', async () => {
    const getBytes = await sources()
    const seen: number[] = []
    let total = 0
    await runExport(
      request('merged', [[{ sourceId: 'a', pageIndex: 0 }, { sourceId: 'b', pageIndex: 0 }]]),
      getBytes,
      (done, t) => (seen.push(done), (total = t)),
    )
    expect(seen.at(-1)).toBe(total)
  })

  it('fails with a clear error when a source cannot be read', async () => {
    await expect(
      runExport(request('merged', [[{ sourceId: 'missing', pageIndex: 0 }]]), async () => {
        throw new PdfError('failed', 'A source file is no longer available.')
      }),
    ).rejects.toMatchObject({ code: 'failed' })
  })

  it('refuses to export nothing', async () => {
    await expect(runExport({ kind: 'merged', parts: [] }, async () => new Uint8Array())).rejects.toMatchObject({
      code: 'failed',
    })
  })
})
