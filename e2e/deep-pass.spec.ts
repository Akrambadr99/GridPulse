import { expect, test } from '@playwright/test'
test('switching changes load reachability and rejects double feed', async ({ page }) => {
  await page.goto('/grid/topology/SS-NORTH')
  await expect(page.getByText('HOSPITAL remains isolated', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Toggle SW-2' }).click()
  await expect(page.getByText('All modeled loads are energized')).toBeVisible()
  await page.getByRole('button', { name: 'Toggle TIE-8' }).click()
  await expect(page.getByRole('status')).toContainText('synchronizing permit')
})
