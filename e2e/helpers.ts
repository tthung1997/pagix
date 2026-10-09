import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { unzipSync } from 'fflate'
import type { Download, Page } from '@playwright/test'
import { makePdf, type FixturePage } from '../src/test/fixtures.ts'

export interface UploadFile {
  name: string
  mimeType: string
  buffer: Buffer
}

export async function pdfUpload(name: string, pages: FixturePage[]): Promise<UploadFile> {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await makePdf(pages)) }
}

/** Pages whose widths identify them: base, base+1, ... */
export const widthPages = (base: number, count: number): FixturePage[] =>
  Array.from({ length: count }, (_, i) => ({ text: `W${base + i}`, width: base + i, height: 400 }))

export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => Math.round(p.getSize().width))
}

export async function downloadBytes(download: Download): Promise<Uint8Array> {
  const path = await download.path()
  return new Uint8Array(await readFile(path))
}

export async function zipWidths(bytes: Uint8Array): Promise<Record<string, number[]>> {
  const entries = unzipSync(bytes)
  const out: Record<string, number[]> = {}
  for (const name of Object.keys(entries).sort()) out[name] = await pageWidths(entries[name]!)
  return out
}

export const fileInput = (page: Page) => page.getByTestId('file-input')
export const cards = (page: Page) => page.locator('.page-card:not(.is-overlay)')

export async function importFiles(page: Page, files: UploadFile[]) {
  await fileInput(page).setInputFiles(files)
}

export async function pageOrder(page: Page): Promise<string[]> {
  return cards(page).locator('.page-card-meta').allTextContents()
}
