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

export async function mockPluginsSuccess(
  page: Page,
  categories: Array<{
    type: string;
    plugins: Array<{
      name: string;
      namespace: string;
      type: string;
      short_description: string | null;
      description: string | null;
      params: Array<{
        name: string;
        description: string;
        type?: string | null;
        default?: string | null;
        required?: boolean;
      }>;
      examples: string | null;
      source: string;
    }>;
  }>
): Promise<void> {
  await page.route('**/plugins', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ categories }),
    });
  });
}

export async function mockPluginsError(
  page: Page,
  status: number,
  error: string
): Promise<void> {
  await page.route('**/plugins', async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ error }),
    });
  });
}

export async function mockPluginsLoading(
  page: Page
): Promise<{ fulfill: () => Promise<void> }> {
  let resolveFulfill: () => void;
  const fulfillPromise = new Promise<void>((resolve) => {
    resolveFulfill = resolve;
  });

  await page.route('**/plugins', async (route) => {
    await fulfillPromise;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ categories: [] }),
    });
  });

  return {
    fulfill: async () => {
      resolveFulfill!();
    },
  };
}

export const RICH_MOCK_CATEGORIES = [
  {
    type: 'filter',
    plugins: [
      {
        name: 'ansible.builtin.to_yaml',
        namespace: 'ansible.builtin',
        type: 'filter',
        short_description: 'Convert to YAML',
        description: 'Converts a data structure to B(YAML) format.\nUse C(to_yaml) filter with O(ignore:indent) option.\nSee U(https://yaml.org) for spec.',
        params: [
          {
            name: 'indent',
            description: 'Number of spaces for I(indentation). Default V(2).',
            type: 'int',
            default: '2',
            required: false,
          },
          {
            name: 'allow_unicode',
            description: 'Allow C(unicode) characters. Set to V(true) for international text.',
            type: 'bool',
            default: 'true',
            required: false,
          },
        ],
        examples: '# Convert variable to YAML\n{{ myvar | to_yaml }}\n\n# With custom indent\n{{ myvar | to_yaml(indent=4) }}',
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
        description: 'Returns the contents of a file.\nUse with `lookup` function.',
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
        short_description: 'Test if number is absolute',
        description: 'Returns true if the number is a positive integer.',
        params: [],
        examples: null,
        source: 'builtin',
      },
    ],
  },
];
