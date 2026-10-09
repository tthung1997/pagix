# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
People who need to rearrange, combine, or split PDFs quickly: students, freelancers, office workers, and anyone handling documents they would rather not upload to a third-party service. They arrive mid-task with one or more PDFs and want a result file in minutes.

## Product Purpose
Pagix is a fast, private PDF page organizer. Users drop in PDFs, drag pages around, then export a merged PDF or split the arrangement into parts. Everything runs locally in the browser; files are never uploaded. Success is a correct output file with no surprise and no data leaving the device.

## Positioning
Local-only processing is the claim a hosted PDF tool cannot truthfully copy: no upload, no account, no backend.

## Operating Context
Used in a desktop or mobile browser, on documents of modest to moderate size. v0.1 is a single-session, in-memory workspace: closing or refreshing the tab discards it.

## Capabilities and Constraints
- Import multiple PDFs; combined retained sources limited to 100 MiB and 500 pages.
- Preview pages, reorder them (drag, keyboard, or move buttons), remove pages, undo/redo edits.
- Mark split points between pages; split markers belong to sequence positions, not to pages.
- Export one merged PDF, or a ZIP of split parts.
- Out of scope: password-protected PDFs, OCR, compression, signatures, content editing, page rotation, saved sessions, accounts, backend.
- "Shuffle" means manual reordering.
- Page copying is not a lossless clone: bookmarks, form behavior, attachments, and signatures are not guaranteed to survive.

## Brand Commitments
Tagline: "Split. Merge. Shuffle. In your browser." License: MIT.

## Evidence on Hand
No customers, testimonials, benchmarks, or pricing exist; none may be invented.

## Product Principles
- Privacy is architectural, not a promise: nothing leaves the tab.
- The page sequence is the interface; everything else supports it.
- Be honest about limits and failures, and never lose the user's work to an error.
- Every action is reversible or explicitly confirmed.

## Accessibility & Inclusion
Every operation must be reachable without drag gestures and without a pointer; visible focus, announced results, usable touch targets, reduced-motion support.
