import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetStoreForTesting,
  fetchPlugins,
  getPluginStore,
  getPluginDescription,
  getPluginExamples,
  type PluginsResponse,
} from './plugin-data';

const RICH_MOCK_CATEGORIES: PluginsResponse['categories'] = [
  {
    type: 'filter',
    plugins: [
      {
        name: 'ansible.builtin.to_yaml',
        namespace: 'ansible.builtin',
        type: 'filter',
        short_description: 'Convert to YAML',
        description:
          'Converts a data structure to B(YAML) format.\nUse C(to_yaml) filter with O(ignore:indent) option.\nSee U(https://yaml.org) for spec.',
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
        examples:
          '# Convert variable to YAML\n{{ myvar | to_yaml }}\n\n# With custom indent\n{{ myvar | to_yaml(indent=4) }}',
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

function createJsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('plugin-data', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.resetAllMocks();
    _resetStoreForTesting();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetchPlugins retries once after 503 warmup', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ error: 'warming' }, 503) as never)
      .mockResolvedValueOnce(createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never);

    const promise = fetchPlugins();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).resolves.toEqual({ categories: RICH_MOCK_CATEGORIES });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts idle with no plugins', () => {
    const store = getPluginStore();

    expect(store.state).toBe('idle');
    expect(store.plugins).toBeNull();
  });

  it('transitions loading to ready after a successful load', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never
    );

    const store = getPluginStore();
    const loadPromise = store.load();

    expect(store.state).toBe('loading');

    await loadPromise;

    expect(store.state).toBe('ready');
    expect(store.plugins).toEqual({ categories: RICH_MOCK_CATEGORIES });
  });

  it('only fetches once when load is called twice', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never
    );

    const store = getPluginStore();
    await Promise.all([store.load(), store.load()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.state).toBe('ready');
  });

  it('returns filter plugins when loaded', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never
    );

    const store = getPluginStore();
    await store.load();

    expect(store.getPluginsByType('filter')).toHaveLength(2);
    expect(store.getPluginsByType('filter')[0].name).toBe('ansible.builtin.to_yaml');
  });

  it('returns an empty array when plugins are not loaded', () => {
    const store = getPluginStore();

    expect(store.getPluginsByType('filter')).toEqual([]);
  });

  it('fires onReady after load completes', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never
    );

    const store = getPluginStore();
    const callback = vi.fn();

    store.onReady(callback);
    await store.load();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('fires onReady immediately when already loaded', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({ categories: RICH_MOCK_CATEGORIES }) as never
    );

    const store = getPluginStore();
    await store.load();

    const callback = vi.fn();
    store.onReady(callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('enters error state on network failure', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const store = getPluginStore();
    await store.load();

    expect(store.state).toBe('error');
    expect(store.error).toContain('network down');
    expect(store.getPluginsByType('filter')).toEqual([]);
  });

  describe('getPluginDescription', () => {
    it('returns description when both exist', () => {
      expect(
        getPluginDescription({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: 'Short description',
          description: 'Full description',
          params: [],
          examples: null,
          source: 'builtin',
        })
      ).toBe('Full description');
    });

    it('falls back to short_description when description is null', () => {
      expect(
        getPluginDescription({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: 'Short description',
          description: null,
          params: [],
          examples: null,
          source: 'builtin',
        })
      ).toBe('Short description');
    });

    it('returns empty string when both are null', () => {
      expect(
        getPluginDescription({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: null,
          description: null,
          params: [],
          examples: null,
          source: 'builtin',
        })
      ).toBe('');
    });
  });

  describe('getPluginExamples', () => {
    it('strips leading newlines from examples', () => {
      expect(
        getPluginExamples({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: 'Short description',
          description: 'Full description',
          params: [],
          examples: '\n\nExample text',
          source: 'builtin',
        })
      ).toBe('Example text');
    });

    it('returns examples unchanged when no leading newline', () => {
      expect(
        getPluginExamples({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: 'Short description',
          description: 'Full description',
          params: [],
          examples: 'Example text',
          source: 'builtin',
        })
      ).toBe('Example text');
    });

    it('returns null when examples is null', () => {
      expect(
        getPluginExamples({
          name: 'ansible.builtin.example',
          namespace: 'ansible.builtin',
          type: 'filter',
          short_description: 'Short description',
          description: 'Full description',
          params: [],
          examples: null,
          source: 'builtin',
        })
      ).toBeNull();
    });
  });
});
