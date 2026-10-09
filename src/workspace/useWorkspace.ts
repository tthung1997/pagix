import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { PdfError, partFilename, type ExportRequest } from '../pdf/types'
import { sourceStore } from '../pdf/sourceStore'
import { pdfWorker } from '../pdf/worker-client'
import { downloadBytes } from './download'
import {
  MAX_TOTAL_BYTES,
  MAX_TOTAL_PAGES,
  checkAdmission,
  computeParts,
  emptyState,
  formatBytes,
  workspaceUsage,
  type Page,
} from './model'
import { reducer } from './reducer'

export interface Message {
  id: number
  tone: 'success' | 'error' | 'info'
  title: string
  details?: string[]
}

export type Operation =
  | { kind: 'import'; current: number; total: number; name: string }
  | { kind: 'export'; mode: 'merged' | 'split'; done: number; total: number }
  | null

let idCounter = 0
const nextId = (prefix: string) => `${prefix}${++idCounter}`

export function useWorkspace() {
  const [state, dispatch] = useReducer(reducer, undefined, emptyState)
  const [operation, setOperation] = useState<Operation>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [announcement, setAnnouncement] = useState('')
  const stateRef = useRef(state)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    sourceStore.retainOnly(Object.keys(state.sources))
  }, [state.sources])

  useEffect(() => () => pdfWorker.terminate(), [])

  const announce = useCallback((text: string) => {
    setAnnouncement((prev) => (prev === text ? `${text}\u00a0` : text))
  }, [])

  const pushMessage = useCallback((message: Omit<Message, 'id'>) => {
    const id = ++idCounter
    setMessages((prev) => [...prev.filter((m) => m.tone === 'error'), { ...message, id }].slice(-4))
    announce(message.title)
    if (message.tone !== 'error') window.setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 8000)
  }, [announce])

  const dismissMessage = useCallback((id: number) => setMessages((prev) => prev.filter((m) => m.id !== id)), [])

  const importFiles = useCallback(
    async (input: File[]) => {
      if (busyRef.current || input.length === 0) return
      busyRef.current = true
      const controller = new AbortController()
      abortRef.current = controller
      const generation = generationRef.current
      const isCurrent = () => generation === generationRef.current && !controller.signal.aborted
      const accepted: string[] = []
      const rejected: string[] = []
      let usage = workspaceUsage(stateRef.current)

      try {
        for (let i = 0; i < input.length; i++) {
          const file = input[i]!
          if (!isCurrent()) return
          setOperation({ kind: 'import', current: i + 1, total: input.length, name: file.name })

          if (file.size === 0) {
            rejected.push(`${file.name}: the file is empty.`)
            continue
          }
          const early = checkAdmission(usage, { size: file.size })
          if (!early.ok) {
            rejected.push(
              `${file.name}: adding it would exceed the ${formatBytes(MAX_TOTAL_BYTES)} limit (${formatBytes(usage.bytes)} already in use).`,
            )
            continue
          }
          let pageCount: number
          try {
            pageCount = (await pdfWorker.inspect(file, controller.signal)).pageCount
          } catch (error) {
            if (!isCurrent()) return
            const message = error instanceof PdfError ? error.message : 'The file could not be read.'
            rejected.push(`${file.name}: ${message}`)
            continue
          }
          if (!isCurrent()) return
          const admission = checkAdmission(usage, { size: file.size, pageCount })
          if (!admission.ok) {
            rejected.push(
              admission.reason === 'pages'
                ? `${file.name}: its ${pageCount} pages would exceed the ${MAX_TOTAL_PAGES}-page limit (${usage.pages} already in use).`
                : `${file.name}: adding it would exceed the ${formatBytes(MAX_TOTAL_BYTES)} limit.`,
            )
            continue
          }

          const id = nextId('s')
          sourceStore.register(id, file)
          const pages: Page[] = Array.from({ length: pageCount }, (_, index) => ({
            id: nextId('p'),
            sourceId: id,
            sourceIndex: index,
          }))
          dispatch({ type: 'addSource', source: { id, name: file.name, size: file.size, pageCount }, pages })
          usage = { bytes: usage.bytes + file.size, pages: usage.pages + pageCount }
          accepted.push(file.name)
        }

        if (!isCurrent()) return
        const pageWord = (n: number) => `${n} PDF${n === 1 ? '' : 's'}`
        if (rejected.length > 0) {
          pushMessage({
            tone: 'error',
            title:
              accepted.length > 0
                ? `Added ${pageWord(accepted.length)}; ${rejected.length} could not be added.`
                : `${rejected.length === 1 ? 'That file' : `${rejected.length} files`} could not be added.`,
            details: rejected,
          })
        } else {
          pushMessage({ tone: 'success', title: `Added ${pageWord(accepted.length)} to the workspace.` })
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (generation === generationRef.current) {
          busyRef.current = false
          setOperation(null)
          if (controller.signal.aborted) {
            pushMessage({
              tone: 'info',
              title: `Import cancelled. ${accepted.length} PDF${accepted.length === 1 ? ' was' : 's were'} already added.`,
            })
          }
        }
      }
    },
    [pushMessage],
  )

  const exportPdf = useCallback(
    async (mode: 'merged' | 'split') => {
      if (busyRef.current) return
      const { pages, cuts } = stateRef.current
      const parts = computeParts(pages, cuts)
      if (pages.length === 0 || (mode === 'split' && parts.length < 2)) return

      const ref = (p: Page) => ({ sourceId: p.sourceId, pageIndex: p.sourceIndex })
      const request: ExportRequest =
        mode === 'merged'
          ? { kind: 'merged', parts: [{ filename: 'pagix-merged.pdf', pages: pages.map(ref) }] }
          : { kind: 'split', parts: parts.map((part) => ({ filename: partFilename(part.index), pages: part.pages.map(ref) })) }
      const files = sourceStore.filesFor(new Set(pages.map((p) => p.sourceId)))

      busyRef.current = true
      const controller = new AbortController()
      abortRef.current = controller
      const generation = generationRef.current
      setOperation({ kind: 'export', mode, done: 0, total: pages.length + 1 })
      try {
        const result = await pdfWorker.export(request, files, controller.signal, (done, total) =>
          setOperation((op) => (op?.kind === 'export' ? { ...op, done, total } : op)),
        )
        if (generation !== generationRef.current || controller.signal.aborted) return
        downloadBytes(result.bytes, result.filename, result.mime)
        pushMessage({
          tone: 'success',
          title:
            mode === 'merged'
              ? `Downloaded ${result.filename} (${pages.length} pages, ${formatBytes(result.bytes.byteLength)}).`
              : `Downloaded ${result.filename} with ${parts.length} parts (${formatBytes(result.bytes.byteLength)}).`,
        })
      } catch (error) {
        if (generation !== generationRef.current) return
        if (error instanceof PdfError && error.code === 'cancelled') {
          pushMessage({ tone: 'info', title: 'Export cancelled. Your workspace is unchanged.' })
        } else {
          pushMessage({
            tone: 'error',
            title: 'The export failed. Your workspace is unchanged.',
            details: [error instanceof PdfError ? error.message : 'The PDF could not be processed.'],
          })
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (generation === generationRef.current) {
          busyRef.current = false
          setOperation(null)
        }
      }
    },
    [pushMessage],
  )

  const cancelOperation = useCallback(() => abortRef.current?.abort(), [])

  const clearWorkspace = useCallback(() => {
    generationRef.current++
    abortRef.current?.abort()
    abortRef.current = null
    busyRef.current = false
    sourceStore.clear()
    dispatch({ type: 'clear' })
    setOperation(null)
    setMessages([])
    announce('Workspace cleared.')
  }, [announce])

  const movePage = useCallback(
    (from: number, to: number) => {
      const page = stateRef.current.pages[from]
      if (!page) return
      dispatch({ type: 'movePage', from, to })
      announce(`Moved page ${from + 1} to position ${to + 1}.`)
    },
    [announce],
  )

  const removePage = useCallback(
    (pageId: string) => {
      const index = stateRef.current.pages.findIndex((p) => p.id === pageId)
      if (index < 0) return
      dispatch({ type: 'removePage', pageId })
      announce(`Removed page ${index + 1}. Undo is available.`)
    },
    [announce],
  )

  const toggleCut = useCallback(
    (position: number) => {
      const had = stateRef.current.cuts.includes(position)
      dispatch({ type: 'toggleCut', position })
      announce(had ? `Removed split after page ${position}.` : `Split added after page ${position}.`)
    },
    [announce],
  )

  const undo = useCallback(() => {
    if (busyRef.current || stateRef.current.past.length === 0) return
    dispatch({ type: 'undo' })
    announce('Undid the last change.')
  }, [announce])

  const redo = useCallback(() => {
    if (busyRef.current || stateRef.current.future.length === 0) return
    dispatch({ type: 'redo' })
    announce('Redid the change.')
  }, [announce])

  const parts = useMemo(() => computeParts(state.pages, state.cuts), [state.pages, state.cuts])
  const usage = useMemo(() => workspaceUsage(state), [state])

  return {
    state,
    parts,
    usage,
    operation,
    messages,
    announcement,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    importFiles,
    exportPdf,
    cancelOperation,
    clearWorkspace,
    dismissMessage,
    movePage,
    removePage,
    toggleCut,
    undo,
    redo,
    announce,
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
