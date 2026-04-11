export interface PluginParam {
  name: string;
  description: string;
  type?: string | null;
  default?: string | null;
  required?: boolean;
}

export interface PluginEntry {
  name: string;
  namespace: string;
  type: string;
  short_description: string | null;
  description: string | null;
  params: PluginParam[];
  examples: string | null;
  source: string;
}

export function getPluginDescription(plugin: PluginEntry): string {
  return plugin.description ?? plugin.short_description ?? '';
}

export function getPluginExamples(plugin: PluginEntry): string | null {
  if (!plugin.examples) return null;
  return plugin.examples.replace(/^\n+/, '');
}

export interface PluginCategory {
  type: string;
  plugins: PluginEntry[];
}

export interface PluginsResponse {
  categories: PluginCategory[];
}

export interface PluginStore {
  plugins: PluginsResponse | null;
  state: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load(): Promise<void>;
  getPluginsByType(type: 'filter' | 'lookup' | 'test'): PluginEntry[];
  onReady(callback: () => void): void;
}

const WARMUP_RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function parseErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: string } | unknown;
    if (body && typeof body === 'object' && 'error' in body) {
      const error = (body as { error?: string }).error;
      return error ?? null;
    }
  } catch {
    // Ignore JSON parse failures and fall back to status-based messages.
  }
  return null;
}

export async function fetchPlugins(): Promise<PluginsResponse> {
  const response = await fetch('/plugins');

  if (response.status === 503) {
    await delay(WARMUP_RETRY_DELAY_MS);
    const retryResponse = await fetch('/plugins');
    if (retryResponse.status === 503) {
      throw new Error('Plugin docs are still warming up. Please try again later.');
    }
    if (!retryResponse.ok) {
      const error = await parseErrorMessage(retryResponse);
      throw new Error(
        error ? `Failed to load plugin docs. ${error}` : `Server error ${retryResponse.status}`
      );
    }
    return (await retryResponse.json()) as PluginsResponse;
  }

  if (!response.ok) {
    const error = await parseErrorMessage(response);
    throw new Error(
      error ? `Failed to load plugin docs. ${error}` : `Server error ${response.status}`
    );
  }

  return (await response.json()) as PluginsResponse;
}

let singletonStore: PluginStore | null = null;

function createPluginStore(): PluginStore {
  let plugins: PluginsResponse | null = null;
  let state: PluginStore['state'] = 'idle';
  let error: string | null = null;
  const readyCallbacks: Array<() => void> = [];

  const notifyReady = (): void => {
    const callbacks = readyCallbacks.splice(0, readyCallbacks.length);
    for (const callback of callbacks) {
      callback();
    }
  };

  return {
    get plugins() {
      return plugins;
    },
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    async load(): Promise<void> {
      if (state === 'loading' || state === 'ready') {
        return;
      }

      state = 'loading';
      error = null;

      try {
        plugins = await fetchPlugins();
        state = 'ready';
        error = null;
        notifyReady();
      } catch (loadError) {
        plugins = null;
        state = 'error';
        error = loadError instanceof Error ? loadError.message : String(loadError);
      }
    },
    getPluginsByType(type: 'filter' | 'lookup' | 'test'): PluginEntry[] {
      if (!plugins || state !== 'ready') {
        return [];
      }

      const category = plugins.categories.find((entry) => entry.type === type);
      return category?.plugins ?? [];
    },
    onReady(callback: () => void): void {
      if (state === 'ready') {
        callback();
        return;
      }

      readyCallbacks.push(callback);
    },
  };
}

export function getPluginStore(): PluginStore {
  if (!singletonStore) {
    singletonStore = createPluginStore();
  }

  return singletonStore;
}

export function _resetStoreForTesting(): void {
  singletonStore = null;
}
