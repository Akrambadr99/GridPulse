import { expect, test } from '@playwright/test'

test('stale topology review conflicts before dispatch and cancellation releases the switch plan', async ({ page }) => {
  await page.goto('/grid/topology/SS-NORTH')
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await page.goto('/grid/topology/SS-NORTH/dispatch/PEAK?mw=8')
  await page.getByLabel('Decision authority').selectOption('control approver')
  await page.getByLabel('Reviewed topology revision').fill('0')
  await expect(page.getByRole('alert')).toContainText('Topology changed')
  await expect(page.getByRole('button', { name: 'Commit dispatch interval' })).toBeDisabled()
  await page.getByRole('button', { name: 'Review current topology' }).click()
  await page.getByRole('button', { name: 'Commit dispatch interval' }).click()
  await page.getByRole('button', { name: 'Cancel dispatch' }).click()
  await page.goto('/grid/topology/SS-NORTH')
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await expect(page.getByRole('status')).not.toContainText('Committed dispatch depends')
})
