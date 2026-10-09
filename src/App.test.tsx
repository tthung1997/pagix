// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfError } from './pdf/types'

const worker = vi.hoisted(() => ({
  inspect: vi.fn(),
  export: vi.fn(),
  terminate: vi.fn(),
}))

vi.mock('./pdf/worker-client', () => ({ pdfWorker: worker }))
vi.mock('./pdf/preview', () => ({
  PreviewCancelled: class PreviewCancelled extends Error {},
  releasePreviewSource: vi.fn(),
  requestThumbnail: () => ({ promise: new Promise(() => {}), release() {} }),
}))

import { App } from './App'

const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: 'application/pdf' })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

async function importPdf(user: ReturnType<typeof userEvent.setup>, ...files: File[]) {
  await user.upload(screen.getByTestId('file-input'), files)
}

beforeEach(() => {
  worker.inspect.mockReset()
  worker.export.mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const pages = () => screen.queryAllByRole('listitem').filter((li) => li.classList.contains('page-cell'))
const notice = async (text: string | RegExp) =>
  within(await screen.findByRole('list', { name: 'Notifications' })).findByText(text)

describe('import lifecycle', () => {
  it('shows the empty state with disabled exports', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Drop PDFs to start' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download merged PDF' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Download split ZIP' })).toBeDisabled()
  })

  it('does not commit an in-flight import after the workspace is cleared', async () => {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect.mockResolvedValueOnce({ pageCount: 2 })
    await importPdf(user, pdf('first.pdf'))
    await waitFor(() => expect(pages()).toHaveLength(2))

    const slow = deferred<{ pageCount: number }>()
    worker.inspect.mockReturnValueOnce(slow.promise)
    await importPdf(user, pdf('second.pdf'))
    expect(await screen.findByRole('group', { name: 'Operation in progress' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear workspace' }))
    await user.click(
      within(screen.getByRole('group', { name: 'Confirm clearing the workspace' })).getByRole('button', {
        name: 'Clear workspace',
      }),
    )
    expect(screen.getByRole('heading', { name: 'Drop PDFs to start' })).toBeInTheDocument()

    slow.resolve({ pageCount: 3 })
    await new Promise((r) => setTimeout(r, 20))
    expect(pages()).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Drop PDFs to start' })).toBeInTheDocument()
    expect(screen.queryByText(/Added/)).not.toBeInTheDocument()
  })

  it('reports rejected files individually while keeping accepted ones', async () => {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect
      .mockResolvedValueOnce({ pageCount: 1 })
      .mockRejectedValueOnce(new PdfError('encrypted', 'The PDF is password-protected, which Pagix does not support.'))
    await importPdf(user, pdf('ok.pdf'), pdf('locked.pdf'))
    expect(await notice('Added 1 PDF; 1 could not be added.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Notifications' })).getByText('locked.pdf: The PDF is password-protected, which Pagix does not support.')).toBeInTheDocument()
    expect(pages()).toHaveLength(1)
  })

  it('shows import progress and lets the user cancel', async () => {
    const user = userEvent.setup()
    render(<App />)
    const slow = deferred<{ pageCount: number }>()
    worker.inspect.mockReturnValueOnce(slow.promise)
    await importPdf(user, pdf('slow.pdf'))
    expect(await screen.findByText(/Reading 1 of 1: slow.pdf/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    slow.reject(new PdfError('cancelled', 'The operation was cancelled.'))
    expect(await notice(/Import cancelled/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Operation in progress' })).not.toBeInTheDocument()
  })
})

describe('export', () => {
  async function loaded(count = 4) {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect.mockResolvedValueOnce({ pageCount: count })
    await importPdf(user, pdf('doc.pdf'))
    await waitFor(() => expect(pages()).toHaveLength(count))
    return user
  }

  it('sends pages in visible order and split boundaries to the worker', async () => {
    const user = await loaded(4)
    await user.click(screen.getByRole('button', { name: 'Move page 4 earlier' }))
    await user.click(screen.getByRole('button', { name: 'Split after page 2' }))
    worker.export.mockResolvedValueOnce({ bytes: new Uint8Array([1]), filename: 'pagix-split.zip', mime: 'application/zip' })
    await user.click(screen.getByRole('button', { name: /Download split ZIP \(2 parts\)/ }))

    await waitFor(() => expect(worker.export).toHaveBeenCalledTimes(1))
    const [request] = worker.export.mock.calls[0]!
    expect(request.kind).toBe('split')
    expect(request.parts.map((p: { filename: string; pages: { pageIndex: number }[] }) => [p.filename, p.pages.map((x) => x.pageIndex)])).toEqual([
      ['pagix-part-001.pdf', [0, 1]],
      ['pagix-part-002.pdf', [3, 2]],
    ])
    expect(await notice(/Downloaded pagix-split.zip with 2 parts/)).toBeInTheDocument()
  })

  it('ignores split markers for the merged export', async () => {
    const user = await loaded(3)
    await user.click(screen.getByRole('button', { name: 'Split after page 1' }))
    worker.export.mockResolvedValueOnce({ bytes: new Uint8Array([1]), filename: 'pagix-merged.pdf', mime: 'application/pdf' })
    await user.click(screen.getByRole('button', { name: 'Download merged PDF' }))
    await waitFor(() => expect(worker.export).toHaveBeenCalled())
    const [request] = worker.export.mock.calls[0]!
    expect(request.kind).toBe('merged')
    expect(request.parts).toHaveLength(1)
    expect(request.parts[0].pages).toHaveLength(3)
  })

  it('keeps the workspace and explains a failed export without a success message', async () => {
    const user = await loaded(2)
    worker.export.mockRejectedValueOnce(new PdfError('failed', 'The PDF could not be processed.'))
    await user.click(screen.getByRole('button', { name: 'Download merged PDF' }))
    expect(await notice('The export failed. Your workspace is unchanged.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Notifications' })).queryByText(/Downloaded/)).not.toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(pages()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Download merged PDF' })).toBeEnabled()
  })

  it('reports a cancelled export without downloading', async () => {
    const user = await loaded(2)
    const slow = deferred<never>()
    worker.export.mockReturnValueOnce(slow.promise)
    await user.click(screen.getByRole('button', { name: 'Download merged PDF' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    slow.reject(new PdfError('cancelled', 'The operation was cancelled.'))
    expect(await notice('Export cancelled. Your workspace is unchanged.')).toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('disables editing and a second export while one is running', async () => {
    const user = await loaded(3)
    const slow = deferred<never>()
    worker.export.mockReturnValueOnce(slow.promise)
    await user.click(screen.getByRole('button', { name: 'Download merged PDF' }))
    expect(await screen.findByRole('button', { name: 'Building…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove page 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add PDFs' })).toBeDisabled()
    slow.reject(new PdfError('cancelled', 'The operation was cancelled.'))
  })
})

describe('editing', () => {
  it('removes a page, then undoes and redoes it', async () => {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect.mockResolvedValueOnce({ pageCount: 3 })
    await importPdf(user, pdf('doc.pdf'))
    await waitFor(() => expect(pages()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Remove page 2' }))
    expect(pages()).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(pages()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(pages()).toHaveLength(2)
  })

  it('supports Ctrl+Z and Ctrl+Shift+Z', async () => {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect.mockResolvedValueOnce({ pageCount: 3 })
    await importPdf(user, pdf('doc.pdf'))
    await waitFor(() => expect(pages()).toHaveLength(3))
    await user.click(screen.getByRole('button', { name: 'Remove page 1' }))
    await user.keyboard('{Control>}z{/Control}')
    expect(pages()).toHaveLength(3)
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(pages()).toHaveLength(2)
  })

  it('removing the last page returns to the empty state and undo brings it back', async () => {
    const user = userEvent.setup()
    render(<App />)
    worker.inspect.mockResolvedValueOnce({ pageCount: 1 })
    await importPdf(user, pdf('doc.pdf'))
    await waitFor(() => expect(pages()).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Remove page 1' }))
    expect(screen.getByRole('heading', { name: 'Drop PDFs to start' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(pages()).toHaveLength(1)
  })
})
