import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null

/** PDF.js is large, so it is only fetched when the first preview is requested. */
function loadPdfjs() {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    },
  )
  return pdfjsPromise
}

const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`
const THUMB_MAX_WIDTH = 360
const THUMB_MAX_HEIGHT = 480
const CACHE_LIMIT = 96
const CONCURRENCY = 2

export class PreviewCancelled extends Error {
  constructor() {
    super('Preview cancelled')
    this.name = 'PreviewCancelled'
  }
}

interface LoadedDoc {
  task: PDFDocumentLoadingTask | null
  disposed: boolean
  promise: Promise<PDFDocumentProxy>
}

interface Job {
  key: string
  sourceId: string
  pageIndex: number
  file: File
  subscribers: number
  started: boolean
  promise: Promise<ImageBitmap>
  resolve: (bitmap: ImageBitmap) => void
  reject: (error: unknown) => void
}

const docs = new Map<string, LoadedDoc>()
const cache = new Map<string, ImageBitmap>()
const jobs = new Map<string, Job>()
const queue: Job[] = []
let running = 0

const keyOf = (sourceId: string, pageIndex: number) => `${sourceId}:${pageIndex}`

function loadDoc(sourceId: string, file: File): Promise<PDFDocumentProxy> {
  const existing = docs.get(sourceId)
  if (existing) return existing.promise
  // Reading into a fresh buffer keeps the retained File usable: PDF.js transfers ownership of its input.
  const entry: LoadedDoc = { task: null, disposed: false, promise: null as unknown as Promise<PDFDocumentProxy> }
  entry.promise = Promise.all([loadPdfjs(), file.arrayBuffer()]).then(([pdfjs, buffer]) => {
    if (entry.disposed) throw new PreviewCancelled()
    entry.task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      cMapUrl: `${ASSET_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
      wasmUrl: `${ASSET_BASE}wasm/`,
      iccUrl: `${ASSET_BASE}iccs/`,
      enableXfa: false,
      disableAutoFetch: true,
      disableStream: true,
    })
    return entry.task.promise
  })
  entry.promise.catch(() => {})
  docs.set(sourceId, entry)
  return entry.promise
}

async function renderThumbnail(job: Job): Promise<ImageBitmap> {
  const doc = await loadDoc(job.sourceId, job.file)
  const { AnnotationMode } = await loadPdfjs()
  const page = await doc.getPage(job.pageIndex + 1)
  try {
    const natural = page.getViewport({ scale: 1 })
    const scale = Math.min(THUMB_MAX_WIDTH / natural.width, THUMB_MAX_HEIGHT / natural.height)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    await page.render({
      canvas,
      viewport,
      background: 'rgb(255, 255, 255)',
      annotationMode: AnnotationMode.DISABLE,
    }).promise
    const bitmap = await createImageBitmap(canvas)
    canvas.width = 0
    canvas.height = 0
    return bitmap
  } finally {
    page.cleanup()
  }
}

function remember(key: string, bitmap: ImageBitmap) {
  cache.set(key, bitmap)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string
    cache.get(oldest)?.close()
    cache.delete(oldest)
  }
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!
    job.started = true
    running++
    renderThumbnail(job)
      .then((bitmap) => {
        if (jobs.get(job.key) === job) {
          remember(job.key, bitmap)
          job.resolve(bitmap)
        } else {
          bitmap.close()
          job.reject(new PreviewCancelled())
        }
      })
      .catch(job.reject)
      .finally(() => {
        if (jobs.get(job.key) === job) jobs.delete(job.key)
        running--
        pump()
      })
  }
}

export interface ThumbnailRequest {
  promise: Promise<ImageBitmap>
  /** Drops interest; queued work with no remaining subscribers is discarded. */
  release(): void
}

export function requestThumbnail(sourceId: string, pageIndex: number, file: File): ThumbnailRequest {
  const key = keyOf(sourceId, pageIndex)
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return { promise: Promise.resolve(cached), release() {} }
  }
  let job = jobs.get(key)
  if (!job) {
    let resolve!: Job['resolve']
    let reject!: Job['reject']
    const promise = new Promise<ImageBitmap>((res, rej) => ((resolve = res), (reject = rej)))
    promise.catch(() => {})
    job = { key, sourceId, pageIndex, file, subscribers: 0, started: false, promise, resolve, reject }
    jobs.set(key, job)
    queue.push(job)
    pump()
  }
  job.subscribers++
  const owned = job
  let released = false
  return {
    promise: owned.promise,
    release() {
      if (released) return
      released = true
      owned.subscribers--
      if (owned.subscribers <= 0 && !owned.started) {
        const at = queue.indexOf(owned)
        if (at >= 0) queue.splice(at, 1)
        if (jobs.get(owned.key) === owned) jobs.delete(owned.key)
        owned.reject(new PreviewCancelled())
      }
    },
  }
}

/** Frees the PDF.js document, cached bitmaps and queued work belonging to a source. */
export function releasePreviewSource(sourceId: string) {
  for (const [key, job] of [...jobs]) {
    if (job.sourceId !== sourceId) continue
    jobs.delete(key)
    const at = queue.indexOf(job)
    if (at >= 0) queue.splice(at, 1)
    job.reject(new PreviewCancelled())
  }
  for (const [key, bitmap] of [...cache]) {
    if (key.startsWith(`${sourceId}:`)) {
      bitmap.close()
      cache.delete(key)
    }
  }
  const doc = docs.get(sourceId)
  if (doc) {
    docs.delete(sourceId)
    doc.disposed = true
    doc.task?.destroy().catch(() => {})
  }
}
