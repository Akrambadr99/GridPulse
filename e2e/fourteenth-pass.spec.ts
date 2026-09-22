import { expect, test } from '@playwright/test'

test('feeder control assignment and outage scope persist across routes', async ({ page }) => {
  await page.goto('/grid/feeder-workspace?feeder=F-13')
  await expect(page.getByLabel('Control queue')).toContainText('F-13')
  await page.getByRole('button', { name: 'Assign selected control request' }).click()
  await expect(page.getByRole('status')).toContainText('assigned')
  await page.goto('/operations')
  await page.goto('/grid/feeder-workspace?feeder=F-13')
  await expect(page.getByLabel('Selected feeder')).toContainText('control-ada')
  await page.getByRole('button', { name: 'Revise linked outage group' }).click()
  await expect(page.getByRole('status')).toContainText('related feeders updated')
  await expect(page.getByLabel('Selected feeder')).toContainText('switching r4')
  await page.reload()
  await expect(page.getByLabel('Selected feeder')).toContainText('switching r4')
  await page.getByLabel('Feeder collection').getByRole('button', { name: /F-21/ }).click()
  await expect(page.getByLabel('Selected feeder')).toContainText('switching r2')
})
