import {
  MAX_HISTORY,
  emptyState,
  normalizeCuts,
  type Page,
  type Snapshot,
  type Source,
  type WorkspaceState,
} from './model'

export type Action =
  | { type: 'addSource'; source: Source; pages: Page[] }
  | { type: 'movePage'; from: number; to: number }
  | { type: 'removePage'; pageId: string }
  | { type: 'toggleCut'; position: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }

const snapshot = (s: WorkspaceState): Snapshot => ({ pages: s.pages, cuts: s.cuts })

/** Drops sources that neither the workspace nor any undo/redo entry can still reference. */
function pruneSources(state: WorkspaceState): WorkspaceState {
  const live = new Set<string>()
  for (const snap of [snapshot(state), ...state.past, ...state.future]) {
    for (const p of snap.pages) live.add(p.sourceId)
  }
  const ids = Object.keys(state.sources)
  if (ids.every((id) => live.has(id))) return state
  const sources: Record<string, Source> = {}
  for (const id of ids) if (live.has(id)) sources[id] = state.sources[id]!
  return { ...state, sources }
}

function commit(state: WorkspaceState, next: Snapshot): WorkspaceState {
  const past = [...state.past, snapshot(state)].slice(-MAX_HISTORY)
  return pruneSources({ ...state, ...next, past, future: [] })
}

export function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'addSource': {
      // Imports clear history so undo never references a different import generation.
      const pages = [...state.pages, ...action.pages]
      return pruneSources({
        ...state,
        sources: { ...state.sources, [action.source.id]: action.source },
        pages,
        past: [],
        future: [],
      })
    }
    case 'movePage': {
      const { from, to } = action
      const n = state.pages.length
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state
      const pages = state.pages.slice()
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved!)
      return commit(state, { pages, cuts: state.cuts })
    }
    case 'removePage': {
      const index = state.pages.findIndex((p) => p.id === action.pageId)
      if (index < 0) return state
      const pages = state.pages.filter((_, i) => i !== index)
      const shifted = state.cuts.map((c) => (index < c ? c - 1 : c))
      return commit(state, { pages, cuts: normalizeCuts(shifted, pages.length) })
    }
    case 'toggleCut': {
      const { position } = action
      if (position < 1 || position >= state.pages.length) return state
      const cuts = state.cuts.includes(position)
        ? state.cuts.filter((c) => c !== position)
        : normalizeCuts([...state.cuts, position], state.pages.length)
      return commit(state, { pages: state.pages, cuts })
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return pruneSources({
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
      })
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return pruneSources({
        ...state,
        ...next,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
      })
    }
    case 'clear':
      return emptyState()
  }
}
