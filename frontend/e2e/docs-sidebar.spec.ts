import { test, expect } from '@playwright/test';
import { mockPluginsSuccess, mockPluginsError, mockPluginsLoading, RICH_MOCK_CATEGORIES } from './helpers/mock-api';

const testCategories = [
  {
    type: 'filter',
    plugins: [
      {
        name: 'ansible.builtin.to_yaml',
        namespace: 'ansible.builtin',
        type: 'filter',
        short_description: 'Convert to YAML',
        description: 'Converts a data structure to YAML format.',
        params: [{ name: 'indent', description: 'Indentation level', type: 'int', default: '2', required: false }],
        examples: '{{ myvar | to_yaml }}',
        source: 'builtin',
      },
      {
        name: 'ansible.builtin.to_json',
        namespace: 'ansible.builtin',
        type: 'filter',
        short_description: 'Convert to JSON',
        description: 'Converts a data structure to JSON format.',
        params: [],
        examples: null,
        source: 'builtin',
      },
    ],
  },
  {
    type: 'lookup',
    plugins: [
      {
        name: 'ansible.builtin.file',
        namespace: 'ansible.builtin',
        type: 'lookup',
        short_description: 'Read file contents',
        description: 'Returns the contents of a file.',
        params: [],
        examples: null,
        source: 'builtin',
      },
    ],
  },
  {
    type: 'test',
    plugins: [
      {
        name: 'ansible.builtin.is_abs',
        namespace: 'ansible.builtin',
        type: 'test',
        short_description: 'Test absolute',
        description: 'Test if absolute.',
        params: [],
        examples: null,
        source: 'builtin',
      },
    ],
  },
];

test.describe('Docs sidebar — smoke', () => {
  test('docs toggle button is visible on page load', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await expect(page.locator('#docs-toggle')).toBeVisible();
  });

  test('docs sidebar is hidden by default', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await expect(page.locator('#docs-sidebar')).toBeHidden();
  });
});

test.describe('Docs sidebar — toggle', () => {
  test('clicking docs button opens sidebar', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();

    await expect(page.locator('#docs-sidebar')).toBeVisible();
  });

  test('clicking close button closes sidebar', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    await page.locator('#docs-close').click();

    await expect(page.locator('#docs-sidebar')).toBeHidden();
  });
});

test.describe('Docs sidebar — content', () => {
  test('sidebar shows plugin cards after loading', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card').first()).toBeVisible();
  });

  test('plugin card shows name', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();
  });

  test('plugin card shows source badge', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card__source').first()).toContainText('builtin');
  });

  test('plugin card shows description', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();
    await page.locator('.docs-plugin-card').first().click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(
      page.locator('.docs-sidebar__detail .docs-plugin-card__description', { hasText: 'Converts a data structure to YAML format.' })
    ).toBeVisible();
  });

  test('plugin card shows params when present', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const cardWithParams = page.locator('.docs-sidebar__detail .docs-plugin-card__params dl');
    await expect(cardWithParams).toBeVisible();
    await expect(cardWithParams).toContainText('indent');
  });

  test('plugin card shows examples when present', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const cardWithExamples = page.locator('.docs-sidebar__detail .docs-plugin-card__examples pre');
    await expect(cardWithExamples).toBeVisible();
    await expect(cardWithExamples).toContainText('{{ myvar | to_yaml }}');
  });
});

test.describe('Docs sidebar — search', () => {
  test('typing in search filters plugins', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('#docs-search').fill('yaml');
    await page.waitForTimeout(300);

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_json' })).not.toBeVisible();
  });

  test('clearing search restores all plugins', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('#docs-search').fill('yaml');
    await page.waitForTimeout(300);
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_json' })).not.toBeVisible();

    await page.locator('#docs-search').fill('');
    await page.waitForTimeout(300);

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_json' })).toBeVisible();
  });

  test('search matches description text', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('#docs-search').fill('JSON format');
    await page.waitForTimeout(300);

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_json' })).toBeVisible();
  });
});

test.describe('Docs sidebar — sections', () => {
  test('renders a section header for each category', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const headers = page.locator('.docs-sidebar__section-header');
    await expect(headers).toHaveCount(3);
  });

  test('section headers show category names', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-sidebar__section-header', { hasText: 'Filter' })).toBeVisible();
    await expect(page.locator('.docs-sidebar__section-header', { hasText: 'Lookup' })).toBeVisible();
    await expect(page.locator('.docs-sidebar__section-header', { hasText: 'Test' })).toBeVisible();
  });

  test('clicking section header collapses the section', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();

    await page.locator('.docs-sidebar__section-header', { hasText: 'Filter' }).click();

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeHidden();
  });

  test('clicking collapsed section header expands it again', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-sidebar__section-header', { hasText: 'Filter' }).click();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeHidden();

    await page.locator('.docs-sidebar__section-header', { hasText: 'Filter' }).click();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();
  });

  test('plugins from ALL categories are visible simultaneously', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' })).toBeVisible();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'file' })).toBeVisible();
    await expect(page.locator('.docs-plugin-card__name', { hasText: 'is_abs' })).toBeVisible();
  });

  test('search shows "No matching plugins" placeholder in non-matching sections', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('#docs-search').fill('yaml');
    await page.waitForTimeout(300);

    const lookupSection = page.locator('.docs-sidebar__section', { has: page.locator('.docs-sidebar__section-header', { hasText: 'Lookup' }) });
    await expect(lookupSection.locator('.docs-sidebar__section-empty')).toBeVisible();
    await expect(lookupSection.locator('.docs-sidebar__section-empty')).toContainText('No matching plugins');
  });
});

test.describe('Docs sidebar — anchor bar', () => {
  test('anchor bar links render for each category', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const links = page.locator('.docs-sidebar__anchor-link');
    await expect(links).toHaveCount(3);
  });

  test('anchor bar shows category names', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-sidebar__anchor-link', { hasText: 'Filter' })).toBeVisible();
    await expect(page.locator('.docs-sidebar__anchor-link', { hasText: 'Lookup' })).toBeVisible();
    await expect(page.locator('.docs-sidebar__anchor-link', { hasText: 'Test' })).toBeVisible();
  });
});

test.describe('Docs sidebar — loading', () => {
  test('sidebar shows loading indicator while fetching', async ({ page }) => {
    const mock = await mockPluginsLoading(page);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();

    await expect(page.locator('#docs-loading')).toBeVisible();

    await mock.fulfill();

    await expect(page.locator('#docs-loading')).toBeHidden();
  });
});

test.describe('Docs sidebar — error', () => {
  test('sidebar shows error when /plugins returns 500', async ({ page }) => {
    await mockPluginsError(page, 500, 'introspection failed');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();

    await expect(page.locator('#docs-error')).toBeVisible();
  });

  test('sidebar shows loading message when /plugins returns 503', async ({ page }) => {
    await mockPluginsError(page, 503, 'warming up');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();

    await expect(page.locator('#docs-loading')).toBeVisible();
  });
});

test.describe('Docs sidebar — markup rendering', () => {
  test('B() macro renders as bold in description', async ({ page }) => {
    await mockPluginsSuccess(page, RICH_MOCK_CATEGORIES);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const descEl = page.locator('.docs-sidebar__detail .docs-plugin-card__description');
    await expect(descEl.locator('b').first()).toBeVisible();
    await expect(descEl.locator('b').first()).toContainText('YAML');
  });

  test('C() macro renders as code in description', async ({ page }) => {
    await mockPluginsSuccess(page, RICH_MOCK_CATEGORIES);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const descEl = page.locator('.docs-sidebar__detail .docs-plugin-card__description');
    await expect(descEl.locator('code').first()).toBeVisible();
    await expect(descEl.locator('code').first()).toContainText('to_yaml');
  });

  test('backtick renders as code in description', async ({ page }) => {
    await mockPluginsSuccess(page, RICH_MOCK_CATEGORIES);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const fileCard = page.locator('.docs-plugin-card__name', { hasText: 'file' }).locator('..').locator('..');
    await fileCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const descEl = page.locator('.docs-sidebar__detail .docs-plugin-card__description');
    await expect(descEl.locator('code')).toBeVisible();
    await expect(descEl.locator('code')).toContainText('lookup');
  });

  test('U() macro renders as an anchor link in description', async ({ page }) => {
    await mockPluginsSuccess(page, RICH_MOCK_CATEGORIES);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const descEl = page.locator('.docs-sidebar__detail .docs-plugin-card__description');
    await expect(descEl.locator('a[href="https://yaml.org"]')).toBeVisible();
  });

  test('examples are plain text inside pre (no markup rendering)', async ({ page }) => {
    await mockPluginsSuccess(page, RICH_MOCK_CATEGORIES);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    const preEl = page.locator('.docs-sidebar__detail .docs-plugin-card__examples pre');
    await expect(preEl).toBeVisible();
    await expect(preEl).toContainText('{{ myvar | to_yaml }}');
    const childCount = await preEl.evaluate((el) => el.children.length);
    expect(childCount).toBe(0);
  });
});

test.describe('Docs sidebar — detail pane', () => {
  test('clicking a card navigates to detail pane', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-plugin-card')).toHaveCount(0);
  });

  test('cards do not render body, toggle, or view-full elements', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await expect(page.locator('.docs-plugin-card__body')).toHaveCount(0);
    await expect(page.locator('.docs-plugin-card__toggle')).toHaveCount(0);
    await expect(page.locator('.docs-plugin-card__view-full')).toHaveCount(0);
  });

  test('back button restores scroll position after card click', async ({ page }) => {
    const longListCategories = [
      {
        type: 'filter',
        plugins: Array.from({ length: 50 }).map((_, i) => ({
          name: `plugin_${i}`,
          namespace: 'test',
          type: 'filter',
          short_description: `Plugin ${i}`,
          description: `Description ${i}`,
          params: [],
          examples: null,
          source: 'builtin',
        })),
      },
    ];
    await mockPluginsSuccess(page, longListCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.evaluate(() => {
      const list = document.querySelector('#docs-plugin-list');
      if (list) list.scrollTop = list.scrollHeight;
    });

    const initialScrollTop = await page.evaluate(() => {
      const list = document.querySelector('#docs-plugin-list');
      return list ? list.scrollTop : 0;
    });

    expect(initialScrollTop).toBeGreaterThan(0);

    const lastCard = page.locator('.docs-plugin-card').last();
    await lastCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();

    await page.locator('.docs-sidebar__detail-back').click();

    await expect(page.locator('.docs-sidebar__detail')).toHaveCount(0);

    const finalScrollTop = await page.evaluate(() => {
      const list = document.querySelector('#docs-plugin-list');
      return list ? list.scrollTop : 0;
    });

    expect(finalScrollTop).toBe(initialScrollTop);
  });

  test('detail pane shows back button', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();

    await expect(page.locator('.docs-sidebar__detail-back')).toBeVisible();
  });

  test('detail pane shows plugin full name', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail-name')).toBeVisible();
    await expect(page.locator('.docs-sidebar__detail-name')).toContainText('ansible.builtin.to_yaml');
  });

  test('back button returns to list', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();

    await page.locator('.docs-sidebar__detail-back').click();

    await expect(page.locator('.docs-sidebar__detail')).toHaveCount(0);
    await expect(page.locator('.docs-plugin-card').first()).toBeVisible();
  });

  test('collapsing a section does not close detail pane', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();

    await page.locator('.docs-sidebar__detail-back').click();
    await expect(page.locator('.docs-sidebar__section-header').first()).toBeVisible();

    await page.locator('.docs-plugin-card').first().click();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
  });

  test('search closes detail pane', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();

    await page.locator('#docs-search').fill('yaml');
    await page.waitForTimeout(300);

    await expect(page.locator('.docs-sidebar__detail')).toHaveCount(0);
    await expect(page.locator('.docs-plugin-card').first()).toBeVisible();
  });

  test('sidebar close and reopen persists detail pane state', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    await page.locator('.docs-plugin-card').first().click();
    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();

    await page.locator('#docs-close').click();
    await expect(page.locator('#docs-sidebar')).toBeHidden();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-plugin-card')).toHaveCount(0);
  });
});

test.describe('Docs sidebar — resize', () => {
  test('resize handle exists when sidebar is open', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    await expect(page.locator('.docs-sidebar__resize-handle')).toBeVisible();
  });

  test('dragging resize handle changes sidebar width', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    const handle = page.locator('.docs-sidebar__resize-handle');
    const sidebar = page.locator('#docs-sidebar');
    const initialWidth = (await sidebar.boundingBox())!.width;
    const bbox = (await handle.boundingBox())!;

    await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(bbox.x - 100, bbox.y + bbox.height / 2);
    await page.mouse.up();

    const newWidth = (await sidebar.boundingBox())!.width;
    expect(newWidth).toBeGreaterThan(initialWidth);
  });

  test('width persists after page reload', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    const handle = page.locator('.docs-sidebar__resize-handle');
    const sidebar = page.locator('#docs-sidebar');
    const bbox = (await handle.boundingBox())!;

    await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(bbox.x - 100, bbox.y + bbox.height / 2);
    await page.mouse.up();

    const widthAfterResize = (await sidebar.boundingBox())!.width;
    const stored = await page.evaluate(() => localStorage.getItem('docs-sidebar-width'));
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeCloseTo(widthAfterResize, 0);

    await page.reload();
    await page.getByRole('code').first().waitFor();
    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    const widthAfterReload = (await page.locator('#docs-sidebar').boundingBox())!.width;
    expect(widthAfterReload).toBeCloseTo(widthAfterResize, 0);
  });

  test('width clamped at minimum 280px', async ({ page }) => {
    await mockPluginsError(page, 503, 'warmup');
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await expect(page.locator('#docs-sidebar')).toBeVisible();

    const handle = page.locator('.docs-sidebar__resize-handle');
    const sidebar = page.locator('#docs-sidebar');
    const bbox = (await handle.boundingBox())!;
    const viewportWidth = page.viewportSize()!.width;

    await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2);
    await page.mouse.down();
    await page.mouse.move(viewportWidth - 10, bbox.y + bbox.height / 2);
    await page.mouse.up();

    const newWidth = (await sidebar.boundingBox())!.width;
    expect(newWidth).toBeGreaterThanOrEqual(280);
  });
});

test.describe('Docs sidebar — section headers', () => {
  test('"Parameters" header visible when params exist', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-sidebar__detail .docs-plugin-card__section-title', { hasText: 'Parameters' })).toBeVisible();
  });

  test('"Examples" header visible when examples exist', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toYamlCard = page.locator('.docs-plugin-card__name', { hasText: 'to_yaml' }).locator('..').locator('..');
    await toYamlCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-sidebar__detail .docs-plugin-card__section-title', { hasText: 'Examples' })).toBeVisible();
  });

  test('no section headers when params and examples absent', async ({ page }) => {
    await mockPluginsSuccess(page, testCategories);
    await page.goto('/');
    await page.getByRole('code').first().waitFor();

    await page.locator('#docs-toggle').click();
    await page.locator('.docs-plugin-card').first().waitFor();

    const toJsonCard = page.locator('.docs-plugin-card__name', { hasText: 'to_json' }).locator('..').locator('..');
    await toJsonCard.click();

    await expect(page.locator('.docs-sidebar__detail')).toBeVisible();
    await expect(page.locator('.docs-sidebar__detail .docs-plugin-card__section-title')).toHaveCount(0);
  });
});
