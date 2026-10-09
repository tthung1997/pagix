import { MAX_TOTAL_BYTES, MAX_TOTAL_PAGES, formatBytes, type Part, type Source, type Usage } from '../workspace/model'
import type { Operation } from '../workspace/useWorkspace'
import { Icon } from './Icon'

interface Props {
  pageCount: number
  parts: Part[]
  sources: Source[]
  usage: Usage
  operation: Operation
  onExport: (mode: 'merged' | 'split') => void
}

const range = (part: Part) =>
  part.pages.length === 1 ? `page ${part.start + 1}` : `pages ${part.start + 1}–${part.start + part.pages.length}`

export function ExportPanel({ pageCount, parts, sources, usage, operation, onExport }: Props) {
  const busy = operation !== null
  const canMerge = pageCount > 0 && !busy
  const canSplit = parts.length >= 2 && !busy
  const exporting = operation?.kind === 'export' ? operation.mode : null

  return (
    <>
      <section className="panel export-panel" aria-labelledby="export-title">
        <h2 id="export-title">Export</h2>
        <p className="summary">
          {pageCount === 0
            ? 'Add PDFs to begin.'
            : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`}
        </p>
        <div className="export-actions">
          <button type="button" className="btn btn-primary" disabled={!canMerge} onClick={() => onExport('merged')}>
            <Icon name="download" />
            {exporting === 'merged' ? 'Building…' : 'Download merged PDF'}
          </button>
          <button type="button" className="btn" disabled={!canSplit} onClick={() => onExport('split')}>
            <Icon name="download" />
            {exporting === 'split' ? 'Building…' : `Download split ZIP${parts.length >= 2 ? ` (${parts.length} parts)` : ''}`}
          </button>
        </div>
        {pageCount > 0 && parts.length < 2 && (
          <p className="hint">Use the scissors between two pages to mark where to split.</p>
        )}
        {parts.length >= 2 && (
          <ol className="parts" aria-label="Split parts">
            {parts.map((part) => (
              <li key={part.index}>
                <span className="part-name">Part {part.index + 1}</span>
                <span className="part-range">{range(part)}</span>
                <span className="part-count">{part.pages.length}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {sources.length > 0 && (
        <section className="panel workspace-panel" aria-labelledby="workspace-title">
          <h2 id="workspace-title">Workspace</h2>
          <dl className="usage">
            <div>
              <dt>Size</dt>
              <dd>
                {formatBytes(usage.bytes)} of {formatBytes(MAX_TOTAL_BYTES)}
              </dd>
              <meter min={0} max={MAX_TOTAL_BYTES} value={usage.bytes} aria-label="Size in use" />
            </div>
            <div>
              <dt>Imported pages</dt>
              <dd>
                {usage.pages} of {MAX_TOTAL_PAGES}
              </dd>
              <meter min={0} max={MAX_TOTAL_PAGES} value={usage.pages} aria-label="Imported pages in use" />
            </div>
          </dl>
          <ul className="sources">
            {sources.map((s) => (
              <li key={s.id}>
                <span className="source-name" title={s.name}>
                  {s.name}
                </span>
                <span className="source-meta">
                  {s.pageCount} pp · {formatBytes(s.size)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="panel note">
        <summary>About exported files</summary>
        <p>
          Pagix copies original pages, so text stays selectable and quality is unchanged. It isn’t a full document
          clone: bookmarks, form behavior, attachments and digital signatures may not carry over. Source size counts
          in full until all of its pages are removed.
        </p>
      </details>
    </>
  )
}
