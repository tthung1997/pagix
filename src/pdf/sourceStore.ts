import { releasePreviewSource } from './preview'

/** Holds the original File handles. Bytes are only read on demand, never kept in React state. */
const files = new Map<string, File>()
/** Registered but not yet seen in committed state; an effect from an older render must not release them. */
const pending = new Set<string>()

export const sourceStore = {
  register(id: string, file: File) {
    files.set(id, file)
    pending.add(id)
  },
  get(id: string): File | undefined {
    return files.get(id)
  },
  /** Releases every committed source (and its preview resources) not listed in `keep`. */
  retainOnly(keep: Iterable<string>) {
    const live = new Set(keep)
    for (const id of live) pending.delete(id)
    for (const id of [...files.keys()]) {
      if (!live.has(id) && !pending.has(id)) this.release(id)
    }
  },
  release(id: string) {
    files.delete(id)
    pending.delete(id)
    releasePreviewSource(id)
  },
  filesFor(ids: Iterable<string>): Record<string, File> {
    const out: Record<string, File> = {}
    for (const id of ids) {
      const file = files.get(id)
      if (file) out[id] = file
    }
    return out
  },
  clear() {
    for (const id of [...files.keys()]) this.release(id)
  },
}
