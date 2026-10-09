import { rm, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  cards,
  downloadBytes,
  fileInput,
  importFiles,
  pageOrder,
  pageWidths,
  pdfUpload,
  widthPages,
  zipWidths,
} from './helpers.ts'

test.describe('organizing PDFs', () => {
  test('imports, reorders, removes, splits and exports without any external request', async ({ page, isMobile }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(e.message))

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Drop PDFs to start' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Download merged PDF' })).toBeDisabled()

    await importFiles(page, [
      await pdfUpload('alpha.pdf', widthPages(200, 3)),
      await pdfUpload('beta.pdf', widthPages(300, 2)),
    ])
    await expect(cards(page)).toHaveCount(5)
    await expect(page.locator('.thumb[data-state="ready"]')).toHaveCount(5)
    await expect(page.getByText('Added 2 PDFs to the workspace.').first()).toBeVisible()
    expect(await pageOrder(page)).toEqual([
      'alpha.pdfp. 1',
      'alpha.pdfp. 2',
      'alpha.pdfp. 3',
      'beta.pdfp. 1',
      'beta.pdfp. 2',
    ])

    // Move beta p.1 to the front with the non-drag controls.
    for (let i = 3; i > 0; i--) {
      await cards(page).nth(i).getByRole('button', { name: /earlier/ }).click()
    }
    expect((await pageOrder(page)).slice(0, 2)).toEqual(['beta.pdfp. 1', 'alpha.pdfp. 1'])

    // Remove alpha p.1, then cut between positions 2 and 3.
    await cards(page).nth(1).getByRole('button', { name: /Remove page/ }).click()
    await expect(cards(page)).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Download split ZIP' })).toBeDisabled()
    await page.getByRole('button', { name: 'Split after page 2' }).click()
    await expect(page.getByRole('button', { name: /Download split ZIP \(2 parts\)/ })).toBeEnabled()
    // The compact mobile export bar hides the parts list; part chips on the cards carry that info.
    if (isMobile) await expect(page.locator('.part-chip')).toHaveCount(2)
    else await expect(page.getByRole('list', { name: 'Split parts' }).getByRole('listitem')).toHaveCount(2)

    const mergedPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download merged PDF' }).click()
    const merged = await mergedPromise
    expect(merged.suggestedFilename()).toBe('pagix-merged.pdf')
    expect(await pageWidths(await downloadBytes(merged))).toEqual([300, 201, 202, 301])

    const zipPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download split ZIP/ }).click()
    const zip = await zipPromise
    expect(zip.suggestedFilename()).toBe('pagix-split.zip')
    expect(await zipWidths(await downloadBytes(zip))).toEqual({
      'pagix-part-001.pdf': [300, 201],
      'pagix-part-002.pdf': [202, 301],
    })

    // Undo walks back through the cut and then the removal; redo replays both.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('button', { name: 'Split after page 2' })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(cards(page)).toHaveCount(5)
    await page.getByRole('button', { name: 'Redo' }).click()
    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(cards(page)).toHaveCount(4)
    await expect(page.getByRole('button', { name: 'Split after page 2' })).toHaveAttribute('aria-pressed', 'true')

    const origin = new URL(page.url()).origin
    const external = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:'))
    expect(external).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('reorders from the keyboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard drag is a desktop interaction')
    await page.goto('/')
    await importFiles(page, [await pdfUpload('alpha.pdf', widthPages(200, 3))])
    await expect(cards(page)).toHaveCount(3)

    await cards(page).nth(0).getByRole('button', { name: /Reorder page 1/ }).focus()
    // dnd-kit attaches its key listeners asynchronously, so wait for each announcement before the next key.
    const live = page.locator('[id^="DndLiveRegion"]')
    await page.keyboard.press('Space')
    await expect(live).toContainText('Page 1 is over position 1')
    await page.keyboard.press('ArrowRight')
    await expect(live).toContainText('Page 1 is over position 2')
    await page.keyboard.press('Space')
    await expect(page.locator('.sr-only[role="status"]')).toContainText('Moved page 1 to position 2')
    expect(await pageOrder(page)).toEqual(['alpha.pdfp. 2', 'alpha.pdfp. 1', 'alpha.pdfp. 3'])
  })

  test('reorders by dragging with a pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Pointer drag is covered by the keyboard and button paths on touch')
    await page.goto('/')
    await importFiles(page, [await pdfUpload('alpha.pdf', widthPages(200, 3))])
    await expect(cards(page)).toHaveCount(3)

    const handle = cards(page).nth(0).getByRole('button', { name: /Reorder page 1/ })
    const target = await cards(page).nth(2).boundingBox()
    const from = await handle.boundingBox()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    await page.mouse.move(target!.x + target!.width / 2, target!.y + 60, { steps: 12 })
    await expect(page.locator('.page-card.is-overlay')).toBeVisible()
    await page.mouse.up()
    await expect.poll(async () => (await pageOrder(page))[2]).toBe('alpha.pdfp. 1')
  })

  test('keeps cuts positional when pages are reordered', async ({ page, isMobile }) => {
    await page.goto('/')
    await importFiles(page, [await pdfUpload('alpha.pdf', widthPages(200, 4))])
    await expect(cards(page)).toHaveCount(4)
    await page.getByRole('button', { name: 'Split after page 2' }).click()
    await cards(page).nth(0).getByRole('button', { name: /later/ }).click()
    await cards(page).nth(1).getByRole('button', { name: /later/ }).click()
    await expect(page.getByRole('button', { name: 'Split after page 2' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.part-chip')).toHaveCount(2)
    if (!isMobile) {
      const parts = page.getByRole('list', { name: 'Split parts' }).getByRole('listitem')
      await expect(parts).toHaveCount(2)
      await expect(parts.nth(0)).toContainText('pages 1–2')
    }
  })
})

test.describe('import validation', () => {
  test('accepts valid files, rejects invalid ones with specific reasons and keeps the workspace', async ({ page }) => {
    await page.goto('/')
    await importFiles(page, [await pdfUpload('good.pdf', widthPages(200, 2))])
    await expect(cards(page)).toHaveCount(2)

    const badFiles = [
      { name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
      { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('definitely not a pdf') },
      { name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<') },
      { ...(await pdfUpload('mislabeled.bin', widthPages(400, 1))), mimeType: 'application/octet-stream' },
    ]
    await importFiles(page, badFiles)
    await expect(cards(page)).toHaveCount(3)
    const alert = page.locator('.message-error')
    await expect(alert).toContainText('Added 1 PDF; 3 could not be added.')
    await expect(alert).toContainText('empty.pdf: the file is empty.')
    await expect(alert).toContainText('notes.pdf: The file is not a PDF document.')
    await expect(alert).toContainText('broken.pdf: The PDF is damaged')
  })

  test('rejects PDFs over the page limit and accepts exactly 500 pages', async ({ page }) => {
    await page.goto('/')
    await importFiles(page, [await pdfUpload('too-many.pdf', widthPages(100, 501))])
    await expect(page.locator('.message-error')).toContainText('501 pages would exceed the 500-page limit')
    await expect(page.getByRole('heading', { name: 'Drop PDFs to start' })).toBeVisible()

    await importFiles(page, [await pdfUpload('exact.pdf', widthPages(100, 500))])
    await expect(cards(page)).toHaveCount(500)
    await importFiles(page, [await pdfUpload('one-more.pdf', widthPages(100, 1))])
    await expect(page.locator('.message-error').last()).toContainText('would exceed the 500-page limit')
    await expect(cards(page)).toHaveCount(500)
  })

  test('rejects input larger than 100 MB before parsing it', async ({ page }, testInfo) => {
    await page.goto('/')
    const path = testInfo.outputPath('huge.pdf')
    await writeFile(path, Buffer.alloc(100 * 1024 * 1024 + 1, 0x20))
    await fileInput(page).setInputFiles(path)
    await expect(page.locator('.message-error')).toContainText('huge.pdf: adding it would exceed the 100 MB limit')
    await expect(page.getByRole('heading', { name: 'Drop PDFs to start' })).toBeVisible()
    await rm(path, { force: true })
  })

  test('adds the same file twice without collisions', async ({ page }) => {
    await page.goto('/')
    const file = await pdfUpload('same.pdf', widthPages(200, 2))
    await importFiles(page, [file])
    await expect(cards(page)).toHaveCount(2)
    await importFiles(page, [file])
    await expect(cards(page)).toHaveCount(4)
    await expect(page.locator('.thumb[data-state="ready"]')).toHaveCount(4)
  })

  test('accepts files dropped onto the window', async ({ page }) => {
    await page.goto('/')
    const file = await pdfUpload('dropped.pdf', widthPages(200, 2))
    const data = await page.evaluateHandle(
      async ({ name, bytes }) => {
        const dt = new DataTransfer()
        dt.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }))
        return dt
      },
      { name: file.name, bytes: [...file.buffer] },
    )
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: data })
    await expect(page.getByText('Drop PDFs to add them')).toBeVisible()
    await page.dispatchEvent('body', 'drop', { dataTransfer: data })
    await expect(cards(page)).toHaveCount(2)
  })
})

test.describe('workspace lifecycle', () => {
  test('clear workspace asks for confirmation and empties everything', async ({ page }) => {
    await page.goto('/')
    await importFiles(page, [await pdfUpload('alpha.pdf', widthPages(200, 2))])
    await expect(cards(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Clear workspace' }).click()
    await page.getByRole('button', { name: 'Keep working' }).click()
    await expect(cards(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Clear workspace' }).click()
    await page.getByRole('group', { name: 'Confirm clearing the workspace' }).getByRole('button', { name: 'Clear workspace' }).click()
    await expect(page.getByRole('heading', { name: 'Drop PDFs to start' })).toBeVisible()
  })
})
