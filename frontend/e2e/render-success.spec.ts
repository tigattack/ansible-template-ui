import { test, expect } from '@playwright/test';
import { mockRenderSuccess } from './helpers/mock-api';
import { setEditorContent } from './helpers/editor';

test.describe('Render success', () => {
  test('renders with default editor values', async ({ page }) => {
    await mockRenderSuccess(page, 'bar');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#render-button').click();

    await expect(page.locator('#render-output')).toContainText('bar');
    await expect(page.locator('#error-display')).toBeHidden();
  });

  test('renders with custom editor values', async ({ page }) => {
    let capturedBody: { template?: string; variables?: string } = {};

    await page.route('**/render', async (route) => {
      const request = route.request();
      capturedBody = JSON.parse(request.postData() ?? '{}') as { template?: string; variables?: string };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'hello world' }),
      });
    });

    await page.goto('/');
    const editors = page.getByRole('code');
    await editors.first().waitFor();

    await setEditorContent(page, editors.nth(0), 'greeting: hello world');
    await setEditorContent(page, editors.nth(1), '{{ greeting }}');

    await page.locator('#render-button').click();

    await expect(page.locator('#render-output')).toContainText('hello world');
    await expect(capturedBody.template).toBe('{{ greeting }}');
    await expect(capturedBody.variables).toBe('greeting: hello world');
  });

  test('button shows loading state during render', async ({ page }) => {
    await page.route('**/render', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
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
