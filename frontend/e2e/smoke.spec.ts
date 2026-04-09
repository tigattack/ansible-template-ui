import { test, expect } from '@playwright/test';

test.describe('Smoke — page load', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('code').first().waitFor();
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('Ansible Template Tester');
  });

  test('shows two Monaco editors', async ({ page }) => {
    await expect(page.getByRole('code')).toHaveCount(2);
  });

  test('render button is visible with Render text', async ({ page }) => {
    await expect(page.locator('#render-button')).toBeVisible();
    await expect(page.locator('#render-button')).toContainText('Render');
  });

  test('raw toggle is visible and unchecked by default', async ({ page }) => {
    const toggle = page.locator('#raw-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
  });

  test('error display and warmup display are hidden by default', async ({ page }) => {
    await expect(page.locator('#error-display')).toBeHidden();
    await expect(page.locator('#warmup-display')).toBeHidden();
  });
});
