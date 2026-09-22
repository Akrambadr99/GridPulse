import { expect, test } from '@playwright/test'

test('switching author hands a restored plan to control approval', async ({ page }) => {
  await page.goto('/grid/topology/SS-NORTH')
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await page.goto('/grid/topology/SS-NORTH/dispatch/PEAK?mw=8')
  await expect(page.getByText('Queue: control-review')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Commit dispatch interval' })).toBeDisabled()
  await page.getByLabel('Decision authority').selectOption('control approver')
  await page.getByRole('button', { name: 'Commit dispatch interval' }).click()
  await expect(page.getByText('Queue: committed')).toBeVisible()
})
