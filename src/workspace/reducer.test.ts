import { describe, expect, it } from 'vitest'
import {
  MAX_HISTORY,
  MAX_TOTAL_BYTES,
  MAX_TOTAL_PAGES,
  checkAdmission,
  computeParts,
  emptyState,
  workspaceUsage,
  type Page,
  type Source,
  type WorkspaceState,
} from './model'
import { reducer, type Action } from './reducer'

const makeSource = (id: string, pageCount: number, size = 1000): { source: Source; pages: Page[] } => ({
  source: { id, name: `${id}.pdf`, size, pageCount },
  pages: Array.from({ length: pageCount }, (_, i) => ({ id: `${id}-p${i}`, sourceId: id, sourceIndex: i })),
})

const run = (state: WorkspaceState, ...actions: Action[]) => actions.reduce(reducer, state)

const withDoc = (id: string, count: number, state = emptyState()) => {
  const { source, pages } = makeSource(id, count)
  return reducer(state, { type: 'addSource', source, pages })
}

const ids = (s: WorkspaceState) => s.pages.map((p) => p.id)

describe('addSource', () => {
  it('appends pages in source order and keeps document order', () => {
    const s = withDoc('b', 2, withDoc('a', 3))
    expect(ids(s)).toEqual(['a-p0', 'a-p1', 'a-p2', 'b-p0', 'b-p1'])
  })

  it('clears undo history on import', () => {
    let s = withDoc('a', 3)
    s = run(s, { type: 'removePage', pageId: 'a-p1' })
    expect(s.past).toHaveLength(1)
    s = withDoc('b', 1, s)
    expect(s.past).toHaveLength(0)
    expect(s.future).toHaveLength(0)
  })
})

describe('movePage', () => {
  it('reorders pages and leaves cut positions unchanged', () => {
    let s = withDoc('a', 4)
    s = run(s, { type: 'toggleCut', position: 2 }, { type: 'movePage', from: 0, to: 3 })
    expect(ids(s)).toEqual(['a-p1', 'a-p2', 'a-p3', 'a-p0'])
    expect(s.cuts).toEqual([2])
    expect(computeParts(s.pages, s.cuts).map((p) => p.pages.length)).toEqual([2, 2])
  })

  it('ignores no-op and out-of-range moves without touching history', () => {
    const s = withDoc('a', 3)
    expect(reducer(s, { type: 'movePage', from: 1, to: 1 })).toBe(s)
    expect(reducer(s, { type: 'movePage', from: 0, to: 3 })).toBe(s)
  })

  it('supports the same file imported twice without id collisions', () => {
    const s = withDoc('a2', 2, withDoc('a1', 2))
    expect(new Set(ids(s)).size).toBe(4)
  })
})

describe('toggleCut', () => {
  it('adds, sorts and removes cuts', () => {
    let s = withDoc('a', 5)
    s = run(s, { type: 'toggleCut', position: 3 }, { type: 'toggleCut', position: 1 })
    expect(s.cuts).toEqual([1, 3])
    s = run(s, { type: 'toggleCut', position: 3 })
    expect(s.cuts).toEqual([1])
  })

  it('rejects positions before the first or after the last page', () => {
    const s = withDoc('a', 3)
    expect(reducer(s, { type: 'toggleCut', position: 0 })).toBe(s)
    expect(reducer(s, { type: 'toggleCut', position: 3 })).toBe(s)
  })
})

describe('removePage', () => {
  it('shifts later cuts left', () => {
    let s = withDoc('a', 6)
    s = run(s, { type: 'toggleCut', position: 4 }, { type: 'removePage', pageId: 'a-p0' })
    expect(s.cuts).toEqual([3])
  })

  it('keeps cuts located before the removed page', () => {
    let s = withDoc('a', 6)
    s = run(s, { type: 'toggleCut', position: 2 }, { type: 'removePage', pageId: 'a-p4' })
    expect(s.cuts).toEqual([2])
  })

  it('collapses a part that would become empty and deduplicates', () => {
    let s = withDoc('a', 5)
    s = run(s, { type: 'toggleCut', position: 2 }, { type: 'toggleCut', position: 3 }, { type: 'removePage', pageId: 'a-p2' })
    expect(s.cuts).toEqual([2])
    expect(computeParts(s.pages, s.cuts).every((p) => p.pages.length > 0)).toBe(true)
  })

  it('discards cuts that fall on the new endpoints', () => {
    let s = withDoc('a', 3)
    s = run(s, { type: 'toggleCut', position: 1 }, { type: 'removePage', pageId: 'a-p0' })
    expect(s.cuts).toEqual([])
    s = withDoc('a', 3)
    s = run(s, { type: 'toggleCut', position: 2 }, { type: 'removePage', pageId: 'a-p2' })
    expect(s.cuts).toEqual([])
  })

  it('handles removing the final page', () => {
    const s = run(withDoc('a', 1), { type: 'removePage', pageId: 'a-p0' })
    expect(s.pages).toEqual([])
    expect(computeParts(s.pages, s.cuts)).toEqual([])
  })
})

describe('undo and redo', () => {
  it('restores order and cuts together', () => {
    let s = withDoc('a', 5)
    s = run(s, { type: 'toggleCut', position: 3 })
    const before = { pages: s.pages, cuts: s.cuts }
    s = run(s, { type: 'removePage', pageId: 'a-p1' })
    expect(s.cuts).toEqual([2])
    s = run(s, { type: 'undo' })
    expect({ pages: s.pages, cuts: s.cuts }).toEqual(before)
    s = run(s, { type: 'redo' })
    expect(s.cuts).toEqual([2])
    expect(s.pages).toHaveLength(4)
  })

  it('drops the redo branch on a new edit', () => {
    let s = withDoc('a', 4)
    s = run(s, { type: 'movePage', from: 0, to: 1 }, { type: 'undo' })
    expect(s.future).toHaveLength(1)
    s = run(s, { type: 'toggleCut', position: 2 })
    expect(s.future).toHaveLength(0)
  })

  it('bounds history to metadata-only snapshots', () => {
    let s = withDoc('a', 4)
    for (let i = 0; i < MAX_HISTORY + 10; i++) s = run(s, { type: 'movePage', from: 0, to: 1 })
    expect(s.past).toHaveLength(MAX_HISTORY)
    for (const snap of s.past) expect(Object.keys(snap).sort()).toEqual(['cuts', 'pages'])
  })

  it('retains a source while undo can still reach it and releases it afterwards', () => {
    let s = withDoc('b', 1, withDoc('a', 1))
    s = run(s, { type: 'removePage', pageId: 'b-p0' })
    expect(Object.keys(s.sources)).toContain('b')
    s = run(s, { type: 'undo' })
    expect(ids(s)).toEqual(['a-p0', 'b-p0'])
    s = run(s, { type: 'redo' })
    s = withDoc('c', 1, s)
    expect(Object.keys(s.sources).sort()).toEqual(['a', 'c'])
  })

  it('releases sources that fall out of bounded history', () => {
    let s = withDoc('b', 1, withDoc('a', 3))
    s = run(s, { type: 'removePage', pageId: 'b-p0' })
    for (let i = 0; i < MAX_HISTORY; i++) s = run(s, { type: 'movePage', from: 0, to: 1 })
    expect(Object.keys(s.sources)).toEqual(['a'])
  })
})

describe('limits', () => {
  it('charges a source in full while any of its pages remain', () => {
    let s = withDoc('a', 10)
    s = run(s, { type: 'removePage', pageId: 'a-p0' })
    expect(workspaceUsage(s)).toEqual({ bytes: 1000, pages: 10 })
  })

  it('releases the charge when the last page of a source is removed', () => {
    let s = withDoc('b', 2, withDoc('a', 2))
    s = run(s, { type: 'removePage', pageId: 'b-p0' }, { type: 'removePage', pageId: 'b-p1' })
    expect(workspaceUsage(s)).toEqual({ bytes: 1000, pages: 2 })
  })

  it('accepts exact limits and rejects anything above', () => {
    expect(checkAdmission({ bytes: 0, pages: 0 }, { size: MAX_TOTAL_BYTES, pageCount: MAX_TOTAL_PAGES })).toEqual({ ok: true })
    expect(checkAdmission({ bytes: 0, pages: 0 }, { size: MAX_TOTAL_BYTES + 1 })).toEqual({ ok: false, reason: 'bytes' })
    expect(checkAdmission({ bytes: 0, pages: 0 }, { size: 1, pageCount: MAX_TOTAL_PAGES + 1 })).toEqual({ ok: false, reason: 'pages' })
    expect(checkAdmission({ bytes: MAX_TOTAL_BYTES - 10, pages: 499 }, { size: 11, pageCount: 1 })).toEqual({ ok: false, reason: 'bytes' })
    expect(checkAdmission({ bytes: MAX_TOTAL_BYTES - 10, pages: 499 }, { size: 10, pageCount: 1 })).toEqual({ ok: true })
    expect(checkAdmission({ bytes: 0, pages: 499 }, { size: 1, pageCount: 2 })).toEqual({ ok: false, reason: 'pages' })
  })
})

describe('computeParts', () => {
  it('splits at positional cuts', () => {
    const { pages } = makeSource('a', 6)
    const parts = computeParts(pages, [2, 5])
    expect(parts.map((p) => [p.start, p.pages.length])).toEqual([[0, 2], [2, 3], [5, 1]])
  })

  it('returns one part when there are no cuts', () => {
    const { pages } = makeSource('a', 3)
    expect(computeParts(pages, [])).toHaveLength(1)
  })
})
