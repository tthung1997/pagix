import { PdfError, type ExportRequest, type ExportResult, type Progress } from './types'
import type { WorkerRequest, WorkerResponse } from './pdf.worker'

interface Pending {
  resolve: (value: WorkerResponse) => void
  reject: (error: Error) => void
  onProgress?: Progress
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * Runs PDF jobs in a dedicated worker. Aborting terminates the worker, which is the only
 * way to genuinely stop a synchronous parse; a fresh worker is created on the next job.
 */
export class PdfWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      const entry = this.pending.get(msg.id)
      if (!entry) return
      if (msg.type === 'progress') {
        entry.onProgress?.(msg.done, msg.total)
        return
      }
      this.pending.delete(msg.id)
      entry.resolve(msg)
    }
    worker.onerror = () => this.terminate(new PdfError('failed', 'The PDF worker stopped unexpectedly.'))
    this.worker = worker
    return worker
  }

  terminate(reason: Error = new PdfError('cancelled', 'The operation was cancelled.')) {
    this.worker?.terminate()
    this.worker = null
    const entries = [...this.pending.values()]
    this.pending.clear()
    for (const entry of entries) entry.reject(reason)
  }

  private call(
    message: DistributiveOmit<WorkerRequest, 'id'>,
    signal?: AbortSignal,
    onProgress?: Progress,
  ): Promise<WorkerResponse> {
    if (signal?.aborted) return Promise.reject(new PdfError('cancelled', 'The operation was cancelled.'))
    const id = this.nextId++
    return new Promise<WorkerResponse>((resolve, reject) => {
      const onAbort = () => this.terminate()
      signal?.addEventListener('abort', onAbort, { once: true })
      const cleanup = () => signal?.removeEventListener('abort', onAbort)
      this.pending.set(id, {
        resolve: (v) => (cleanup(), resolve(v)),
        reject: (e) => (cleanup(), reject(e)),
        onProgress,
      })
      try {
        this.ensureWorker().postMessage({ ...message, id } as WorkerRequest)
      } catch (error) {
        this.pending.delete(id)
        cleanup()
        reject(error instanceof Error ? error : new PdfError('failed', 'The PDF worker could not start.'))
      }
    })
  }

  async inspect(file: File, signal?: AbortSignal): Promise<{ pageCount: number }> {
    const msg = await this.call({ type: 'inspect', file }, signal)
    if (msg.type === 'error') throw new PdfError(msg.code, msg.message)
    if (msg.type !== 'inspected') throw new PdfError('failed', 'Unexpected worker response.')
    return { pageCount: msg.pageCount }
  }

  async export(
    request: ExportRequest,
    files: Record<string, File>,
    signal?: AbortSignal,
    onProgress?: Progress,
  ): Promise<ExportResult> {
    const msg = await this.call({ type: 'export', request, files }, signal, onProgress)
    if (msg.type === 'error') throw new PdfError(msg.code, msg.message)
    if (msg.type !== 'exported') throw new PdfError('failed', 'Unexpected worker response.')
    return msg.result
  }
}

export const pdfWorker = new PdfWorkerClient()
