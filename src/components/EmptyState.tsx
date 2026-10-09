import { MAX_TOTAL_BYTES, MAX_TOTAL_PAGES, formatBytes } from '../workspace/model'
import { Icon } from './Icon'

export function EmptyState({ onAdd, busy }: { onAdd: () => void; busy: boolean }) {
  return (
    <section className="empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Drop PDFs to start</h2>
      <p>
        Rearrange pages, mark where to split, then download one merged PDF or a ZIP of parts. Everything stays in this
        tab; nothing is uploaded.
      </p>
      <button type="button" className="btn btn-primary btn-large" onClick={onAdd} disabled={busy}>
        <Icon name="plus" />
        Choose PDFs
      </button>
      <p className="empty-limits">
        Up to {formatBytes(MAX_TOTAL_BYTES)} and {MAX_TOTAL_PAGES} pages in total. Password-protected PDFs aren’t
        supported.
      </p>
    </section>
  )
}
