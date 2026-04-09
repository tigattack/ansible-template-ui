import type { Page } from '@playwright/test';

export async function mockRenderSuccess(page: Page, content: string): Promise<void> {
  await page.route('**/render', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content }),
    });
  });
}

export async function mockRenderError(page: Page, status: number, error: string): Promise<void> {
  await page.route('**/render', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error }),
    });
  });
}

export async function mockRenderWarmup(page: Page, message: string): Promise<void> {
  await page.route('**/render', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: message }),
    });
  });
}
