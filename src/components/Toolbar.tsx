import { useState } from 'react'
import { Icon } from './Icon'

interface Props {
  hasPages: boolean
  busy: boolean
  canUndo: boolean
  canRedo: boolean
  onAdd: () => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function Toolbar({ hasPages, busy, canUndo, canRedo, onAdd, onUndo, onRedo, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="toolbar" role="toolbar" aria-label="Workspace actions">
      <button type="button" className="btn" onClick={onAdd} disabled={busy}>
        <Icon name="plus" />
        Add PDFs
      </button>
      <div className="toolbar-group">
        <button type="button" className="btn btn-quiet" onClick={onUndo} disabled={!canUndo || busy}>
          <Icon name="undo" />
          Undo
        </button>
        <button type="button" className="btn btn-quiet" onClick={onRedo} disabled={!canRedo || busy}>
          <Icon name="redo" />
          Redo
        </button>
      </div>
      <div className="toolbar-end">
        {confirming ? (
          <span className="confirm" role="group" aria-label="Confirm clearing the workspace">
            <span>Clear every page? Closing or refreshing the tab does the same, and this can’t be undone.</span>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setConfirming(false)
                onClear()
              }}
            >
              Clear workspace
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
              Keep working
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)} disabled={!hasPages}>
            Clear workspace
          </button>
        )}
      </div>
    </div>
  )
}
