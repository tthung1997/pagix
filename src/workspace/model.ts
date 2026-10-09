export const MAX_TOTAL_BYTES = 100 * 1024 * 1024
export const MAX_TOTAL_PAGES = 500
export const MAX_HISTORY = 50

export interface Source {
  id: string
  name: string
  size: number
  pageCount: number
}

export interface Page {
  id: string
  sourceId: string
  /** Zero-based page index inside the source document. */
  sourceIndex: number
}

/** A cut at `n` splits the sequence between page n-1 and page n (1 <= n < pages.length). */
export interface Snapshot {
  pages: Page[]
  cuts: number[]
}

export interface WorkspaceState extends Snapshot {
  sources: Record<string, Source>
  past: Snapshot[]
  future: Snapshot[]
}

export interface Part {
  index: number
  pages: Page[]
  /** Zero-based position of the first page in the full sequence. */
  start: number
}

export interface Usage {
  bytes: number
  pages: number
}

export function emptyState(): WorkspaceState {
  return { sources: {}, pages: [], cuts: [], past: [], future: [] }
}

export function computeParts(pages: Page[], cuts: number[]): Part[] {
  if (pages.length === 0) return []
  const bounds = [0, ...cuts, pages.length]
  const parts: Part[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]!
    parts.push({ index: i, start, pages: pages.slice(start, bounds[i + 1]) })
  }
  return parts
}

export function sourceUsage(sources: Iterable<Source>): Usage {
  let bytes = 0
  let pages = 0
  for (const s of sources) {
    bytes += s.size
    pages += s.pageCount
  }
  return { bytes, pages }
}

/** Every source stays charged in full while any of its pages is still in the workspace. */
export function workspaceUsage(state: WorkspaceState): Usage {
  const referenced = new Set(state.pages.map((p) => p.sourceId))
  return sourceUsage(Object.values(state.sources).filter((s) => referenced.has(s.id)))
}

export type AdmissionResult = { ok: true } | { ok: false; reason: 'bytes' | 'pages' }

export function checkAdmission(current: Usage, candidate: { size: number; pageCount?: number }): AdmissionResult {
  if (current.bytes + candidate.size > MAX_TOTAL_BYTES) return { ok: false, reason: 'bytes' }
  if (candidate.pageCount !== undefined && current.pages + candidate.pageCount > MAX_TOTAL_PAGES) {
    return { ok: false, reason: 'pages' }
  }
  return { ok: true }
}

export function normalizeCuts(cuts: number[], pageCount: number): number[] {
  return [...new Set(cuts)].filter((c) => c >= 1 && c < pageCount).sort((a, b) => a - b)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
