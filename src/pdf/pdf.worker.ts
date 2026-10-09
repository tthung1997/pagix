import { inspectPdf, runExport } from './engine'
import { PdfError, type ExportRequest, type ExportResult } from './types'

export type WorkerRequest =
  | { id: number; type: 'inspect'; file: File }
  | { id: number; type: 'export'; request: ExportRequest; files: Record<string, File> }

export type WorkerResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'inspected'; pageCount: number }
  | { id: number; type: 'exported'; result: ExportResult }
  | { id: number; type: 'error'; code: PdfError['code']; message: string }

const post = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer })

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'inspect') {
      const bytes = new Uint8Array(await msg.file.arrayBuffer())
      const { pageCount } = await inspectPdf(bytes)
      post({ id: msg.id, type: 'inspected', pageCount })
    } else {
      const getBytes = async (sourceId: string) => {
        const file = msg.files[sourceId]
        if (!file) throw new PdfError('failed', 'A source file is no longer available.')
        return new Uint8Array(await file.arrayBuffer())
      }
      const result = await runExport(msg.request, getBytes, (done, total) =>
        post({ id: msg.id, type: 'progress', done, total }),
      )
      const buffer = result.bytes.buffer as ArrayBuffer
      post({ id: msg.id, type: 'exported', result }, [buffer])
    }
  } catch (error) {
    if (error instanceof PdfError) {
      post({ id: msg.id, type: 'error', code: error.code, message: error.message })
    } else {
      post({ id: msg.id, type: 'error', code: 'failed', message: 'The PDF could not be processed.' })
    }
  }
}
