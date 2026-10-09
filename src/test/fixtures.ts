import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'

export interface FixturePage {
  text: string
  width?: number
  height?: number
  rotate?: number
}

/** Builds a small deterministic PDF whose pages carry distinguishable text. */
export async function makePdf(pages: FixturePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const spec of pages) {
    const page = doc.addPage([spec.width ?? 300, spec.height ?? 400])
    page.drawText(spec.text, { x: 24, y: (spec.height ?? 400) / 2, size: 28, font })
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
  }
  return doc.save()
}

export const labelledPdf = (prefix: string, count: number) =>
  makePdf(Array.from({ length: count }, (_, i) => ({ text: `${prefix}${i + 1}` })))

/** A PDF that declares an /Encrypt dictionary, which pdf-lib refuses to load. */
export async function makeEncryptedLookingPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  const encrypt = doc.context.obj({ Filter: 'Standard', V: 1, R: 2, O: '(x)', U: '(y)', P: -4 })
  doc.context.trailerInfo.Encrypt = doc.context.register(encrypt)
  return doc.save()
}
