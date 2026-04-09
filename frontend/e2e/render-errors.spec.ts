import { test, expect } from '@playwright/test';
import { mockRenderError, mockRenderSuccess } from './helpers/mock-api';

test.describe('Render errors', () => {
  test('400 Bad Request shows error message', async ({ page }) => {
    await mockRenderError(page, 400, 'Invalid YAML');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#error-display')).toBeVisible();
    await expect(page.locator('#error-display')).toContainText('Error: Invalid YAML');
    await expect(page.locator('#render-output')).toHaveText('');
    await expect(page.locator('#warmup-display')).toBeHidden();
  });

  test('408 Timeout shows error message', async ({ page }) => {
    await mockRenderError(page, 408, 'Container timed out');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#error-display')).toBeVisible();
    await expect(page.locator('#error-display')).toContainText('Error: Container timed out');
  });

  test('500 Internal Server Error shows error message', async ({ page }) => {
    await mockRenderError(page, 500, 'Internal server error');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#error-display')).toBeVisible();
    await expect(page.locator('#error-display')).toContainText('Error: Internal server error');
  });

  test('malformed JSON response shows server error message', async ({ page }) => {
    await page.route('**/render', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'oops',
      });
    });
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#error-display')).toBeVisible();
    await expect(page.locator('#error-display')).toContainText('Error: Server error 500');
  });

  test('error clears on successful re-render', async ({ page }) => {
    await mockRenderError(page, 400, 'First error');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();
    await expect(page.locator('#error-display')).toBeVisible();
    await expect(page.locator('#error-display')).toContainText('Error: First error');

    await page.unroute('**/render');
    await mockRenderSuccess(page, 'recovered');

    await page.locator('#render-button').click();
    await expect(page.locator('#error-display')).toBeHidden();
    await expect(page.locator('#render-output')).toContainText('recovered');
  });
});
