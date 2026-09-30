import { expect, test } from '@playwright/test'

test('feeder triage deep links survive reload and browser history', async ({ page }) => {
  await page.goto('/grid/feeder-workspace?feeder=F-13&q=OUT-NORTH&show=all&sort=id-desc&size=5')
  await expect(page.getByLabel('Search feeders')).toHaveValue('OUT-NORTH')
  await expect(page.getByLabel('Sort feeders')).toHaveValue('id-desc')
  await expect(page.getByLabel('Collection pages')).toContainText('3 matching records')
  await page.reload()
  await page.getByLabel('Work state').selectOption('critical')
  await expect(page.getByLabel('Collection pages')).toContainText('1 matching records')
  await page.goBack()
  await expect(page.getByLabel('Work state')).toHaveValue('all')
  await expect(page.getByLabel('Selected feeder', { exact: true })).toContainText('F-13')
  await page.goForward()
  await expect(page.getByLabel('Work state')).toHaveValue('critical')
})

test('switching detail and decision workflows restore the collection context', async ({ page }) => {
  await page.goto('/grid/feeder-workspace?feeder=F-13&q=OUT-NORTH&state=unclaimed&sort=revision-desc&size=5&source=control')
  for (const name of ['Open record details', 'Open decision workflow']) {
    await page.getByRole('link', { name }).click()
    await expect(page.getByLabel('Selected record context')).toContainText('F-13')
    await page.reload()
    await page.getByRole('link', { name: 'Back to workspace' }).click()
    await expect(page.getByLabel('Search feeders')).toHaveValue('OUT-NORTH')
    await expect(page.getByLabel('Work state')).toHaveValue('unclaimed')
    await expect(page.getByLabel('Sort feeders')).toHaveValue('revision-desc')
    await expect(page).toHaveURL(/source=control/)
    await expect(page.getByLabel('Selected feeder', { exact: true })).toContainText('F-13')
  }
})

test('feeder page selection remains explicit outside the current view', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 })
  await page.goto('/grid/feeder-workspace?feeder=F-13&show=all&size=5')
  await page.getByRole('button', { name: 'Select this page' }).click()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByLabel('Bulk selection')).toContainText('5 feeders selected · 5 outside this page')
  await page.getByLabel('Select F-23', { exact: true }).check()
  await page.getByLabel('Search feeders').fill('does-not-exist')
  await expect(page.getByLabel('Bulk selection')).toContainText('6 feeders selected · 6 outside this page')
  await expect(page.getByLabel('Selected feeder', { exact: true })).toContainText('outside this collection page or view')
  await page.getByRole('button', { name: 'Reset view' }).click()
  await expect(page.getByLabel('Collection pages')).toContainText('5 matching records · Page 1 of 1')
  await expect(page.getByLabel('Bulk selection')).toContainText('6 feeders selected · 1 outside this page')
  await page.screenshot({ path: '../UI_SCREENSHOTS/sixteenth-GridPulse-triage.png', fullPage: true })
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(page.getByRole('button', { name: 'Request selected 10 MW dispatches' })).toBeDisabled()
})

test('control assignment moves work between triage states without reselection', async ({ page }) => {
  await page.goto('/grid/feeder-workspace?feeder=F-13&state=unclaimed')
  await page.getByRole('button', { name: 'Assign selected control request' }).click()
  await expect(page.getByLabel('Collection pages')).toContainText('1 matching records')
  await expect(page.getByLabel('Selected feeder', { exact: true })).toContainText('outside this collection page or view')
  await page.getByLabel('Work state').selectOption('assigned')
  await expect(page.getByLabel('Feeder collection')).toContainText('Current control assignment')
  await expect(page.getByLabel('Selected feeder', { exact: true })).toContainText('F-13')
})
