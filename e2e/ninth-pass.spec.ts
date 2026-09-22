import { expect, test } from '@playwright/test'

test('persisted switch position changes dispatch eligibility and locks reversal', async ({ page }) => {
  await page.goto('/grid/topology/SS-NORTH/dispatch/PEAK?mw=8')
  await page.getByLabel('Decision authority').selectOption('control approver')
  await expect(page.getByRole('button', { name: 'Commit dispatch interval' })).toBeDisabled()
  await page.goto('/grid/topology/SS-NORTH')
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await page.goto('/grid/topology/SS-NORTH/dispatch/PEAK?mw=8')
  await page.getByLabel('Decision authority').selectOption('control approver')
  await page.getByRole('button', { name: 'Commit dispatch interval' }).click()
  await expect(page.getByText('8 MW committed')).toBeVisible()
  await page.goto('/grid/topology/SS-NORTH')
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await expect(page.getByRole('status')).toContainText('Committed dispatch depends')
})
