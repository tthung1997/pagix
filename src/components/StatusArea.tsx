import type { Message, Operation } from '../workspace/useWorkspace'
import { Icon } from './Icon'

export function OperationBar({ operation, onCancel }: { operation: Operation; onCancel: () => void }) {
  if (!operation) return null
  const label =
    operation.kind === 'import'
      ? `Reading ${operation.current} of ${operation.total}: ${operation.name}`
      : operation.mode === 'merged'
        ? 'Building merged PDF…'
        : 'Building split ZIP…'
  const value = operation.kind === 'export' ? operation.done : undefined
  const max = operation.kind === 'export' ? operation.total : undefined
  return (
    <div className="operation" role="group" aria-label="Operation in progress">
      <span className="operation-label">{label}</span>
      <progress value={value} max={max} aria-label={label} />
      <button type="button" className="btn btn-quiet" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

export function Messages({ messages, onDismiss }: { messages: Message[]; onDismiss: (id: number) => void }) {
  if (messages.length === 0) return null
  return (
    <ul className="messages" aria-label="Notifications">
      {messages.map((m) => (
        <li key={m.id} className={`message message-${m.tone}`}>
          <div className="message-body">
            <p className="message-title">{m.title}</p>
            {m.details && (
              <ul className="message-details">
                {m.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => onDismiss(m.id)}>
            <Icon name="x" />
          </button>
        </li>
      ))}
    </ul>
  )
}
