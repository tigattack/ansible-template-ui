import { test, expect } from '@playwright/test';
import { mockRenderSuccess } from './helpers/mock-api';

test.describe('Keyboard shortcut — Ctrl/Cmd+Enter', () => {
  test('Ctrl+Enter from variables editor triggers render', async ({ page }) => {
    await mockRenderSuccess(page, 'bar');
    await page.goto('/');
    const editors = page.getByRole('code');
    await editors.first().waitFor();

    await editors.nth(0).click();
    await page.keyboard.press('Control+Enter');

    await expect(page.locator('#render-output')).toContainText('bar');
  });

  test('Ctrl+Enter from template editor triggers render', async ({ page }) => {
    await mockRenderSuccess(page, 'bar');
    await page.goto('/');
    const editors = page.getByRole('code');
    await editors.first().waitFor();

    await editors.nth(1).click();
    await page.keyboard.press('Control+Enter');

    await expect(page.locator('#render-output')).toContainText('bar');
  });

  test('Ctrl+Enter from outside editors triggers render via global handler', async ({ page }) => {
    await mockRenderSuccess(page, 'bar');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.getByRole('heading', { name: 'Ansible Template Tester' }).click();
    await page.keyboard.press('Control+Enter');

    await expect(page.locator('#render-output')).toContainText('bar');
  });
});
