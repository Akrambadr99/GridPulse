import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void }
declare const document: { documentElement: { scrollWidth: number } }
const key = 'gridpulse:feeder-collection:v1'
const createdAt = '2026-09-30T12:00:00.000Z'
const reviewReady = 'Comparison ready. No saved data was changed.'

function snapshot(raw: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: 'collection-snapshot', version: 1, product: 'GridPulse',
    scope: 'feeder-collection', createdAt, payload: JSON.parse(raw) as unknown, ...extra })
}
function changedHistory(raw: string): string {
  const collection = JSON.parse(raw) as { feeders: { id: string; plan: { history: { affected: string }[] } }[] }
  const event = collection.feeders.find(record => record.id === 'F-13')?.plan.history[0]
  if (!event) throw new Error('Expected a seeded GridPulse history event')
  event.affected = 'Independently inspected snapshot evidence'
  return JSON.stringify(collection)
}
async function prepare(page: Page) {
  await page.goto('/')
  const raw = await page.evaluate<string>('import("/src/topology/operations-graph/feederCollection.ts").then(module => JSON.stringify(module.seedFeederCollection()))')
  await page.evaluate(({ key, raw }) => {
    localStorage.setItem(key, raw)
    localStorage.setItem('unrelated:snapshot-review', 'preserve unrelated workflow')
  }, { key, raw })
  await page.getByRole('link', { name: 'Snapshots', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Collection snapshots', exact: true })).toBeVisible()
  return raw
}
async function savedEntries(page: Page) {
  return page.evaluate<string>('JSON.stringify(Object.entries(localStorage).sort())')
}

test('exports and reviews the scoped collection file without changing browser storage', async ({ page }) => {
  const raw = await prepare(page); const before = await savedEntries(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download collection snapshot', exact: true }).click()
  const download = await downloading; const path = await download.path()
  if (!path) throw new Error('Expected a local collection snapshot download')
  const content = await readFile(path, 'utf8')
  expect(JSON.parse(content)).toMatchObject({ format: 'collection-snapshot', version: 1,
    product: 'GridPulse', scope: 'feeder-collection', payload: JSON.parse(raw) as unknown })
  await page.getByLabel('Snapshot file').setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(content) })
  await expect(page.getByLabel('Snapshot JSON', { exact: true })).toHaveValue(content)
  await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
  await expect(page.getByText(reviewReady, { exact: true })).toBeVisible()
  await page.getByLabel('Show records', { exact: true }).selectOption('all')
  await page.getByRole('button', { name: 'Inspect F-13', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'F-13', exact: true, level: 3 })).toBeVisible()
  expect(await savedEntries(page)).toBe(before)
})

test('finds a nested domain history difference with usable narrow-screen review controls', async ({ page }) => {
  const raw = await prepare(page); const before = await savedEntries(page)
  await page.getByLabel('Snapshot JSON', { exact: true }).fill(snapshot(changedHistory(raw)))
  await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
  await expect(page.getByText(reviewReady, { exact: true })).toBeVisible()
  await page.getByLabel('Show records', { exact: true }).selectOption('changed')
  await page.getByLabel('Find record', { exact: true }).fill('F-13')
  await page.getByRole('button', { name: 'Inspect F-13', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'F-13', exact: true, level: 3 })).toBeVisible()
  for (const width of [820, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const summary of ['Current local record', 'Snapshot record']) {
      const disclosure = page.locator('.snapshot-detail details').filter({ has: page.getByText(summary, { exact: true }) })
      if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click()
    }
    await expect(page.locator('.snapshot-detail pre')).toHaveCount(2)
    for (const record of await page.locator('.snapshot-detail pre').all()) {
      await expect(record).toBeVisible()
      await expect(record).toHaveCSS('color', 'rgb(23, 43, 64)')
      await expect(record).toHaveCSS('background-color', 'rgb(246, 248, 250)')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await expect(page.getByLabel('Find record', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inspect F-13', exact: true })).toBeVisible()
    await page.evaluate('window.scrollTo({ top: 0, left: 0, behavior: "instant" })')
    await page.screenshot({ path: `../UI_SCREENSHOTS/collection-snapshots-GridPulse-${String(width)}.png`, fullPage: true })
  }
  expect(await savedEntries(page)).toBe(before)
})

test('rejects foreign and structurally malformed snapshots while preserving pasted text and saved data', async ({ page }) => {
  const raw = await prepare(page); const before = await savedEntries(page)
  const malformed = JSON.stringify({ ...(JSON.parse(raw) as Record<string, unknown>), feeders: [null] })
  for (const content of [snapshot(raw, { product: 'DifferentProduct' }), snapshot(malformed), '{private truncated JSON']) {
    await page.getByLabel('Snapshot JSON', { exact: true }).fill(content)
    await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('Snapshot JSON', { exact: true })).toHaveValue(content)
    expect(await savedEntries(page)).toBe(before)
  }
})

test('requires refreshing a comparison after another tab changes the primary collection', async ({ page, context }) => {
  const raw = await prepare(page)
  await page.getByLabel('Snapshot JSON', { exact: true }).fill(snapshot(raw))
  await page.getByRole('button', { name: 'Compare snapshot', exact: true }).click()
  await expect(page.getByText(reviewReady, { exact: true })).toBeVisible()
  const peer = await context.newPage()
  await peer.goto('/')
  const changed = changedHistory(raw)
  await peer.evaluate(({ key, raw }) => { localStorage.setItem(key, raw) }, { key, raw: changed })
  await expect(page.getByRole('button', { name: 'Refresh comparison', exact: true })).toBeVisible()
  await peer.close()
  const beforeRefresh = await savedEntries(page)
  await page.getByRole('button', { name: 'Refresh comparison', exact: true }).click()
  await expect(page.getByText(reviewReady, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inspect F-13', exact: true })).toBeVisible()
  expect(await savedEntries(page)).toBe(beforeRefresh)
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(changed)
})
