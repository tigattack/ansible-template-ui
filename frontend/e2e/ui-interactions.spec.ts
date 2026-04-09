import { test, expect } from '@playwright/test';
import { mockRenderSuccess } from './helpers/mock-api';
import { setEditorContent } from './helpers/editor';

test.describe('UI interactions', () => {
  test('raw toggle wraps template in {{ }}', async ({ page }) => {
    let capturedBody: { template?: string; variables?: string } = {};

    await page.route('**/render', async (route) => {
      const request = route.request();
      capturedBody = JSON.parse(request.postData() ?? '{}') as { template?: string; variables?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'result' }),
      });
    });

    await page.goto('/');
    const editors = page.getByRole('code');
    await editors.first().waitFor();

    await setEditorContent(page, editors.nth(1), 'foo | upper');

    await page.locator('#raw-toggle').check();
    await page.locator('#render-button').click();
    await expect(page.locator('#render-output')).toContainText('result');

    expect(capturedBody.template).toBe('{{ foo | upper }}');

    capturedBody = {};
    await page.locator('#raw-toggle').uncheck();
    await page.locator('#render-button').click();
    await expect(page.locator('#render-output')).toContainText('result');

    expect(capturedBody.template).toBe('foo | upper');
  });

  test('button shows loading state during render', async ({ page }) => {
    await page.route('**/render', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'done' }),
      });
    });

    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    const button = page.locator('#render-button');
    const clickPromise = button.click();

    await expect(button).toBeDisabled();
    await expect(button).toContainText('Rendering');

    await clickPromise;

    await expect(button).toBeEnabled();
    await expect(button).toContainText('Render');
  });
});
