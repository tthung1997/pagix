import { forwardRef, type CSSProperties, type HTMLAttributes, type Ref } from 'react'
import type { Page, Source } from '../workspace/model'
import { Icon } from './Icon'
import { Thumbnail } from './Thumbnail'

export interface PageCardProps extends HTMLAttributes<HTMLDivElement> {
  page: Page
  source: Source | undefined
  index: number
  total: number
  partNumber?: number
  isDragging?: boolean
  isOverlay?: boolean
  disabled?: boolean
  handleRef?: Ref<HTMLButtonElement>
  handleProps?: HTMLAttributes<HTMLButtonElement>
  onMove?: (to: number) => void
  onRemove?: () => void
}

export const PageCard = forwardRef<HTMLDivElement, PageCardProps>(function PageCard(
  {
    page,
    source,
    index,
    total,
    partNumber,
    isDragging,
    isOverlay,
    disabled,
    handleRef,
    handleProps,
    onMove,
    onRemove,
    className,
    style,
    ...rest
  },
  ref,
) {
  const position = index + 1
  const name = source?.name ?? 'Unknown file'
  const classes = ['page-card', isDragging ? 'is-dragging' : '', isOverlay ? 'is-overlay' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={ref} className={classes} style={style as CSSProperties} data-page-id={page.id} {...rest}>
      <div className="page-card-head">
        <span className="page-pos" aria-hidden="true">
          {position}
        </span>
        {partNumber !== undefined && <span className="part-chip">Part {partNumber}</span>}
        <button
          type="button"
          ref={handleRef}
          className="icon-btn grip"
          aria-label={`Reorder page ${position}. Drag, or press Space then use arrow keys.`}
          disabled={disabled}
          {...handleProps}
        >
          <Icon name="grip" />
        </button>
      </div>
      <Thumbnail sourceId={page.sourceId} pageIndex={page.sourceIndex} label={`Page ${position}: ${name}, page ${page.sourceIndex + 1}`} />
      <div className="page-card-meta">
        <span className="page-source" title={name}>
          {name}
        </span>
        <span className="page-orig">p. {page.sourceIndex + 1}</span>
      </div>
      <div className="page-card-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move page ${position} earlier`}
          disabled={disabled || index === 0}
          onClick={() => onMove?.(index - 1)}
        >
          <Icon name="left" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Move page ${position} later`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove?.(index + 1)}
        >
          <Icon name="right" />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          aria-label={`Remove page ${position}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
})
