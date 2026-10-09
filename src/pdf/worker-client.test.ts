import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfWorkerClient } from './worker-client'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  posted: unknown[] = []
  terminated = false
  constructor() {
    FakeWorker.instances.push(this)
  }
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated = true
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

const file = new File([new Uint8Array([1])], 'a.pdf')

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

describe('PdfWorkerClient', () => {
  it('resolves inspect results by request id', async () => {
    const client = new PdfWorkerClient()
    const pending = client.inspect(file)
    const worker = FakeWorker.instances[0]!
    const { id } = worker.posted[0] as { id: number }
    worker.reply({ id, type: 'inspected', pageCount: 7 })
    await expect(pending).resolves.toEqual({ pageCount: 7 })
  })

  it('maps worker errors to PdfError codes', async () => {
    const client = new PdfWorkerClient()
    const pending = client.inspect(file)
    const worker = FakeWorker.instances[0]!
    const { id } = worker.posted[0] as { id: number }
    worker.reply({ id, type: 'error', code: 'encrypted', message: 'locked' })
    await expect(pending).rejects.toMatchObject({ code: 'encrypted', message: 'locked' })
  })

  it('terminates the worker on abort and starts a fresh one for the next job', async () => {
    const client = new PdfWorkerClient()
    const controller = new AbortController()
    const pending = client.inspect(file, controller.signal)
    const first = FakeWorker.instances[0]!
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(first.terminated).toBe(true)

    const next = client.inspect(file)
    expect(FakeWorker.instances).toHaveLength(2)
    const second = FakeWorker.instances[1]!
    second.reply({ id: (second.posted[0] as { id: number }).id, type: 'inspected', pageCount: 1 })
    await expect(next).resolves.toEqual({ pageCount: 1 })
  })

  it('ignores replies from a terminated job', async () => {
    const client = new PdfWorkerClient()
    const controller = new AbortController()
    const pending = client.inspect(file, controller.signal)
    const worker = FakeWorker.instances[0]!
    const { id } = worker.posted[0] as { id: number }
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(() => worker.reply({ id, type: 'inspected', pageCount: 3 })).not.toThrow()
  })

  it('rejects immediately when already aborted', async () => {
    const client = new PdfWorkerClient()
    const controller = new AbortController()
    controller.abort()
    await expect(client.inspect(file, controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('reports export progress and results', async () => {
    const client = new PdfWorkerClient()
    const progress: number[] = []
    const pending = client.export({ kind: 'merged', parts: [] }, {}, undefined, (done) => progress.push(done))
    const worker = FakeWorker.instances[0]!
    const { id } = worker.posted[0] as { id: number }
    worker.reply({ id, type: 'progress', done: 2, total: 4 })
    const result = { bytes: new Uint8Array([1]), filename: 'x.pdf', mime: 'application/pdf' }
    worker.reply({ id, type: 'exported', result })
    await expect(pending).resolves.toBe(result)
    expect(progress).toEqual([2])
  })

  it('fails every pending job when the worker crashes', async () => {
    const client = new PdfWorkerClient()
    const pending = client.inspect(file)
    FakeWorker.instances[0]!.onerror?.()
    await expect(pending).rejects.toMatchObject({ code: 'failed' })
  })
})
