# Pagix

**Split. Merge. Shuffle. In your browser.**

Pagix is a fast, private PDF page organizer. Drop in PDFs, drag pages around, then export a merged PDF or split it into parts. Everything runs locally in your browser; your files are never uploaded.

## What it does

- **Import** several PDFs at once (file picker or drag and drop) and keep adding more.
- **Preview** every page as a thumbnail, rendered lazily so large documents stay responsive.
- **Reorder** pages by dragging, with the keyboard (focus a page's grip, press Space, use the arrow keys), or with the *Move earlier / later* buttons.
- **Remove** pages, then **undo / redo** any edit (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
- **Split** by clicking the scissors between two pages. Each part's page range and count is shown before you export.
- **Export** one merged PDF in the current order, or a ZIP with one PDF per part.

Split markers belong to *positions* in the sequence, not to pages: reordering pages never changes how many pages each part has. Removing a page shifts later markers and collapses any part that would become empty.

## Privacy

There is no backend. PDFs are read with the browser's `File` API and processed in memory by PDF.js (previews) and pdf-lib (export) running in the page and in Web Workers. PDF.js workers, CMaps and fonts are served from the app's own build, with no CDN, analytics or remote logging. Closing or refreshing the tab discards the workspace; nothing is persisted.

## Limits and caveats

- Combined limit of **100 MiB** and **500 pages** across the imported source files. A source counts in full until all of its pages are removed from the workspace. These limits gate imports; they do not guarantee that every allowed file is processable on every device.
- Importing more files clears the undo history, which releases sources that only undo was still holding.
- Password-protected PDFs are rejected. Damaged, empty and non-PDF files are rejected with a per-file message while valid files in the same import are kept.
- Export copies the original pages (text stays selectable, nothing is rasterized) and preserves page size, crop box and rotation. It is not a full document clone: bookmarks, interactive form behavior, attachments and digital signatures are not guaranteed to survive, and Pagix does not sanitize documents.
- Out of scope for v0.1: OCR, compression, signing, content editing, page rotation, saved sessions, accounts.

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev        # copies PDF.js runtime assets, then starts Vite
npm run lint       # ESLint
npm run typecheck  # tsc -b
npm test           # Vitest: workspace model, PDF engine, component lifecycle
npm run build      # type-check and production build into dist/
npm run test:e2e   # builds, then runs Playwright against vite preview
```

First time running the browser tests: `npx playwright install --with-deps`.

The `dist/` folder is a static site and can be served by any static host.

### Layout

| Path | Responsibility |
| --- | --- |
| `src/workspace/` | Pure model and reducer (page identities, order, positional splits, bounded undo, limits) and the `useWorkspace` hook that orchestrates imports and exports |
| `src/pdf/engine.ts` | Framework-free PDF inspection, page copying and ZIP assembly (unit-tested) |
| `src/pdf/pdf.worker.ts`, `worker-client.ts` | Runs the engine off the UI thread; cancelling terminates the worker |
| `src/pdf/preview.ts` | Lazy PDF.js loading, bounded thumbnail queue and cache, resource release |
| `src/components/` | Page grid, cards, thumbnails, toolbar, export panel |
| `e2e/` | Playwright workflows, including real downloaded PDF/ZIP content checks |

## License

MIT
