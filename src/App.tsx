import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { EmptyState } from './components/EmptyState'
import { ExportPanel } from './components/ExportPanel'
import { Icon } from './components/Icon'
import { PageGrid } from './components/PageGrid'
import { Messages, OperationBar } from './components/StatusArea'
import { Toolbar } from './components/Toolbar'
import { useWorkspace } from './workspace/useWorkspace'

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

export function App() {
  const ws = useWorkspace()
  const { state, operation, importFiles, undo, redo } = ws
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const busy = operation !== null

  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void importFiles(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const pick = () => inputRef.current?.click()
  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    void importFiles(files)
  }

  const hasPages = state.pages.length > 0
  const sources = Object.values(state.sources)

  return (
    <div className="app">
      <header className="site-header">
        <h1 className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" />
            <rect x="8" y="6" width="11" height="15" rx="1.5" className="mark-a" />
            <rect x="13" y="11" width="11" height="15" rx="1.5" className="mark-b" />
            <path d="M13 5v22" className="mark-cut" />
          </svg>
          Pagix
        </h1>
        <p className="privacy">
          <Icon name="lock" size={16} />
          <span className="privacy-wide">Private by design: files never leave this browser.</span>
          <span className="privacy-narrow">Files never leave this browser.</span>
        </p>
      </header>

      <div className="layout">
        <main className="stage" id="workspace">
          {(hasPages || ws.canUndo) && (
            <Toolbar
              hasPages={hasPages}
              busy={busy}
              canUndo={ws.canUndo}
              canRedo={ws.canRedo}
              onAdd={pick}
              onUndo={undo}
              onRedo={redo}
              onClear={ws.clearWorkspace}
            />
          )}
          <OperationBar operation={operation} onCancel={ws.cancelOperation} />
          <Messages messages={ws.messages} onDismiss={ws.dismissMessage} />
          {hasPages ? (
            <PageGrid
              pages={state.pages}
              cuts={state.cuts}
              parts={ws.parts}
              sources={state.sources}
              disabled={busy}
              onMove={ws.movePage}
              onRemove={ws.removePage}
              onToggleCut={ws.toggleCut}
            />
          ) : (
            <EmptyState onAdd={pick} busy={busy} />
          )}
        </main>
        <aside className="sidebar" aria-label="Export and workspace summary">
          <ExportPanel
            pageCount={state.pages.length}
            parts={ws.parts}
            sources={sources}
            usage={ws.usage}
            operation={operation}
            onExport={(mode) => void ws.exportPdf(mode)}
          />
        </aside>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={onPicked}
        data-testid="file-input"
      />
      <div className="sr-only" role="status" aria-live="polite">
        {ws.announcement}
      </div>
      {dragging && !busy && (
        <div className="drop-overlay" aria-hidden="true">
          <p>Drop PDFs to add them</p>
        </div>
      )}
    </div>
  )
}
