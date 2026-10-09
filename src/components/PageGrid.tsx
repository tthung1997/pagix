import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState } from 'react'
import type { Part, Page, Source } from '../workspace/model'
import { Icon } from './Icon'
import { PageCard } from './PageCard'

interface Props {
  pages: Page[]
  cuts: number[]
  parts: Part[]
  sources: Record<string, Source>
  disabled: boolean
  onMove: (from: number, to: number) => void
  onRemove: (pageId: string) => void
  onToggleCut: (position: number) => void
}

interface SortableCardProps {
  page: Page
  index: number
  total: number
  source: Source | undefined
  partNumber?: number
  disabled: boolean
  onMove: (from: number, to: number) => void
  onRemove: (pageId: string) => void
}

function SortableCard({ page, index, total, source, partNumber, disabled, onMove, onRemove }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled,
  })
  return (
    <PageCard
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      page={page}
      source={source}
      index={index}
      total={total}
      partNumber={partNumber}
      isDragging={isDragging}
      disabled={disabled}
      handleRef={setActivatorNodeRef}
      handleProps={{ ...attributes, ...listeners }}
      onMove={(to) => onMove(index, to)}
      onRemove={() => onRemove(page.id)}
    />
  )
}

export function PageGrid({ pages, cuts, parts, sources, disabled, onMove, onRemove, onToggleCut }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = useMemo(() => pages.map((p) => p.id), [pages])
  const partStarts = useMemo(() => new Map(parts.map((p) => [p.start, p.index + 1])), [parts])
  const cutSet = useMemo(() => new Set(cuts), [cuts])
  const activeIndex = activeId ? pages.findIndex((p) => p.id === activeId) : -1
  const activePage = activeIndex >= 0 ? pages[activeIndex] : undefined

  const announcements: Announcements = useMemo(() => {
    const indexOf = (id: string | number) => ids.indexOf(String(id)) + 1
    return {
      onDragStart: ({ active }) => `Picked up page ${indexOf(active.id)} of ${ids.length}.`,
      onDragOver: ({ active, over }) => (over ? `Page ${indexOf(active.id)} is over position ${indexOf(over.id)}.` : undefined),
      onDragEnd: () => undefined,
      onDragCancel: ({ active }) => `Move cancelled. Page ${indexOf(active.id)} stays in position.`,
    }
  }, [ids])

  const handleStart = (event: DragStartEvent) => setActiveId(String(event.active.id))
  const handleEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from >= 0 && to >= 0) onMove(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To pick up a page, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel.',
        },
      }}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <ol className="page-grid" aria-label="Pages in export order">
          {pages.map((page, index) => {
            const position = index + 1
            const isLast = index === pages.length - 1
            const active = cutSet.has(position)
            return (
              <li className="page-cell" key={page.id}>
                <SortableCard
                  page={page}
                  index={index}
                  total={pages.length}
                  source={sources[page.sourceId]}
                  partNumber={parts.length > 1 ? partStarts.get(index) : undefined}
                  disabled={disabled}
                  onMove={onMove}
                  onRemove={onRemove}
                />
                {!isLast && (
                  <div className={`cut-slot${active ? ' is-cut' : ''}`}>
                    <button
                      type="button"
                      className="cut-btn"
                      aria-pressed={active}
                      aria-label={`Split after page ${position}`}
                      title={active ? `Remove split after page ${position}` : `Split after page ${position}`}
                      disabled={disabled}
                      onClick={() => onToggleCut(position)}
                    >
                      <Icon name="scissors" size={16} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activePage ? (
          <PageCard
            isOverlay
            page={activePage}
            source={sources[activePage.sourceId]}
            index={activeIndex}
            total={pages.length}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
