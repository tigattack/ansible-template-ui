import { test, expect } from '@playwright/test';
import { mockRenderWarmup, mockRenderSuccess } from './helpers/mock-api';

test.describe('Warmup (503)', () => {
  test('503 shows warmup message directly (no Error: prefix)', async ({ page }) => {
    await mockRenderWarmup(page, 'Installing Galaxy collections, please wait...');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#warmup-display')).toBeVisible();
    await expect(page.locator('#warmup-display')).toContainText('Installing Galaxy collections, please wait...');
    await expect(page.locator('#warmup-display')).not.toContainText('Error:');
    await expect(page.locator('#error-display')).toBeHidden();
    await expect(page.locator('#render-output')).toHaveText('');
  });

  test('warmup clears on successful re-render', async ({ page }) => {
    await mockRenderWarmup(page, 'Warming up...');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();
    await expect(page.locator('#warmup-display')).toBeVisible();

    await page.unroute('**/render');
    await mockRenderSuccess(page, 'bar');

    await page.locator('#render-button').click();
    await expect(page.locator('#warmup-display')).toBeHidden();
    await expect(page.locator('#render-output')).toContainText('bar');
  });

  test('503 does not show error display', async ({ page }) => {
    await mockRenderWarmup(page, 'Please wait...');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#warmup-display')).toBeVisible();
    await expect(page.locator('#error-display')).toBeHidden();
  });
});
