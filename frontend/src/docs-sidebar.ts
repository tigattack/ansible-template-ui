import { formatAnsibleMarkup } from './format-ansible-markup';

interface PluginParam {
  name: string;
  description: string;
  type?: string | null;
  default?: string | null;
  required?: boolean;
}

interface PluginEntry {
  name: string;
  namespace: string;
  type: string;
  short_description: string | null;
  description: string | null;
  params: PluginParam[];
  examples: string | null;
  source: string;
}

interface PluginCategory {
  type: string;
  plugins: PluginEntry[];
}

interface PluginsResponse {
  categories: PluginCategory[];
}

export interface DocsSidebarRefs {
  sidebar: HTMLElement;
  resizeHandle: HTMLElement;
  toggleButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  searchInput: HTMLInputElement;
  pluginList: HTMLElement;
  loadingDisplay: HTMLElement;
  errorDisplay: HTMLElement;
  anchorBar: HTMLElement;
}

function getAnsibleDocsUrl(plugin: PluginEntry): string | null {
  if (plugin.source === 'jinja2') return null;
  const parts = plugin.namespace.split('.');
  if (parts.length < 2) return null;
  const shortName = plugin.name.split('.').pop();
  if (!shortName) return null;
  return `https://docs.ansible.com/projects/ansible/latest/collections/${parts[0]}/${parts[1]}/${shortName}_${plugin.type}.html`;
}

export function initDocsSidebar(refs: DocsSidebarRefs): void {
  let pluginsData: PluginsResponse | null = null;
  let searchQuery = '';
  let fetchStarted = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let detailPlugin: PluginEntry | null = null;
  let savedScrollTop = 0;
  const collapsedSections = new Set<string>();

  const storedWidth = localStorage.getItem('docs-sidebar-width');
  if (storedWidth) {
    const w = Number(storedWidth);
    if (w >= 280) {
      refs.sidebar.style.width = `${w}px`;
    }
  }

  refs.resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    document.body.style.userSelect = 'none';
    document.body.style.pointerEvents = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.min(
        Math.max(window.innerWidth - moveEvent.clientX, 280),
        window.innerWidth * 0.5
      );
      refs.sidebar.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
      document.body.style.cursor = '';
      const currentWidth = refs.sidebar.getBoundingClientRect().width;
      localStorage.setItem('docs-sidebar-width', String(currentWidth));
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function showLoading(msg?: string): void {
    refs.loadingDisplay.textContent = msg ?? 'Loading plugin docs...';
    refs.loadingDisplay.removeAttribute('hidden');
    refs.errorDisplay.setAttribute('hidden', '');
    refs.pluginList.textContent = '';
  }

  function showError(msg: string): void {
    refs.errorDisplay.textContent = msg;
    refs.errorDisplay.removeAttribute('hidden');
    refs.loadingDisplay.setAttribute('hidden', '');
    refs.pluginList.textContent = '';
  }

  function hideStates(): void {
    refs.loadingDisplay.setAttribute('hidden', '');
    refs.errorDisplay.setAttribute('hidden', '');
  }

  function renderPluginCards(plugins: PluginEntry[], container: HTMLElement): void {
    container.textContent = '';
    for (const plugin of plugins) {
      const card = document.createElement('div');
      card.className = 'docs-plugin-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const header = document.createElement('div');
      header.className = 'docs-plugin-card__header';

      const nameEl = document.createElement('div');
      nameEl.className = 'docs-plugin-card__name';
      nameEl.textContent = plugin.name;
      header.appendChild(nameEl);

      const sourceEl = document.createElement('span');
      sourceEl.className = 'docs-plugin-card__source';
      sourceEl.textContent = plugin.source;
      header.appendChild(sourceEl);

      if (plugin.short_description) {
        const shortDescEl = document.createElement('div');
        shortDescEl.className = 'docs-plugin-card__short-desc';
        shortDescEl.textContent = plugin.short_description;
        header.appendChild(shortDescEl);
      }

      card.appendChild(header);

      card.addEventListener('click', () => {
        savedScrollTop = refs.pluginList.scrollTop;
        detailPlugin = plugin;
        render();
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') {
            e.preventDefault();
          }
          savedScrollTop = refs.pluginList.scrollTop;
          detailPlugin = plugin;
          render();
        }
      });

      container.appendChild(card);
    }
  }

  function renderDetailPane(): void {
    refs.pluginList.textContent = '';

    const detail = document.createElement('div');
    detail.className = 'docs-sidebar__detail';

    const detailHeader = document.createElement('div');
    detailHeader.className = 'docs-sidebar__detail-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'docs-sidebar__detail-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
      detailPlugin = null;
      render();
      refs.pluginList.scrollTop = savedScrollTop;
    });
    detailHeader.appendChild(backBtn);

    const nameEl = document.createElement('div');
    nameEl.className = 'docs-sidebar__detail-name';
    nameEl.textContent = detailPlugin!.name;
    detailHeader.appendChild(nameEl);

    const sourceEl = document.createElement('span');
    sourceEl.className = 'docs-plugin-card__source';
    sourceEl.textContent = detailPlugin!.source;
    detailHeader.appendChild(sourceEl);

    detail.appendChild(detailHeader);

    const descText =
      detailPlugin!.description ?? detailPlugin!.short_description ?? 'No description available.';
    const descEl = document.createElement('div');
    descEl.className = 'docs-plugin-card__description';
    descEl.innerHTML = formatAnsibleMarkup(descText);
    detail.appendChild(descEl);

    if (detailPlugin!.params && detailPlugin!.params.length > 0) {
      const paramsWrapper = document.createElement('div');
      paramsWrapper.className = 'docs-plugin-card__params';
      const paramsHeader = document.createElement('h4');
      paramsHeader.className = 'docs-plugin-card__section-title';
      paramsHeader.textContent = 'Parameters';
      paramsWrapper.appendChild(paramsHeader);
      const dl = document.createElement('dl');
      for (const param of detailPlugin!.params) {
        const dt = document.createElement('dt');
        let label = param.name;
        if (param.type) label += ` (${param.type})`;
        if (param.required) label += ' *';
        dt.textContent = label;
        dl.appendChild(dt);
        const dd = document.createElement('dd');
        dd.innerHTML = formatAnsibleMarkup(param.description);
        if (param.default !== null && param.default !== undefined) {
          dd.appendChild(document.createTextNode(` [default: ${param.default}]`));
        }
        dl.appendChild(dd);
      }
      paramsWrapper.appendChild(dl);
      detail.appendChild(paramsWrapper);
    }

    if (detailPlugin!.examples) {
      const exWrapper = document.createElement('div');
      exWrapper.className = 'docs-plugin-card__examples';
      const exHeader = document.createElement('h4');
      exHeader.className = 'docs-plugin-card__section-title';
      exHeader.textContent = 'Examples';
      exWrapper.appendChild(exHeader);
      const pre = document.createElement('pre');
      pre.textContent = detailPlugin!.examples.replace(/^\n+/, '');
      exWrapper.appendChild(pre);
      detail.appendChild(exWrapper);
    }

    const docsUrl = getAnsibleDocsUrl(detailPlugin!);
    if (docsUrl) {
      const linkWrapper = document.createElement('div');
      linkWrapper.className = 'docs-sidebar__external-link';

      const link = document.createElement('a');
      link.href = docsUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View on docs.ansible.com ↗';

      linkWrapper.appendChild(link);
      detail.appendChild(linkWrapper);
    }

    refs.pluginList.appendChild(detail);
  }

  function render(): void {
    if (!pluginsData) return;
    hideStates();
    if (detailPlugin) {
      renderDetailPane();
      return;
    }

    refs.pluginList.textContent = '';

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      for (const category of pluginsData.categories) {
        const hasMatches = category.plugins.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.short_description ?? '').toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q)
        );
        if (hasMatches) {
          collapsedSections.delete(category.type);
        }
      }
    }

    for (const category of pluginsData.categories) {
      const q = searchQuery.toLowerCase();
      const filteredPlugins = searchQuery
        ? category.plugins.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.short_description ?? '').toLowerCase().includes(q) ||
              (p.description ?? '').toLowerCase().includes(q)
          )
        : category.plugins;

      const section = document.createElement('div');
      section.className = 'docs-sidebar__section';
      section.id = `docs-section-${category.type}`;

      const header = document.createElement('div');
      header.className = 'docs-sidebar__section-header';

      const toggle = document.createElement('span');
      toggle.className = 'docs-sidebar__section-toggle';
      toggle.textContent = collapsedSections.has(category.type) ? '▶' : '▼';
      header.appendChild(toggle);

      const titleSpan = document.createElement('span');
      titleSpan.textContent = category.type.charAt(0).toUpperCase() + category.type.slice(1);
      header.appendChild(titleSpan);

      const content = document.createElement('div');
      content.className = 'docs-sidebar__section-content';
      if (collapsedSections.has(category.type)) {
        content.setAttribute('hidden', '');
      }

      if (filteredPlugins.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'docs-sidebar__section-empty';
        placeholder.textContent = 'No matching plugins';
        content.appendChild(placeholder);
      } else {
        renderPluginCards(filteredPlugins, content);
      }

      header.addEventListener('click', () => {
        if (collapsedSections.has(category.type)) {
          collapsedSections.delete(category.type);
        } else {
          collapsedSections.add(category.type);
        }
        render();
      });

      section.appendChild(header);
      section.appendChild(content);
      refs.pluginList.appendChild(section);
    }
  }

  async function fetchPlugins(): Promise<void> {
    showLoading();
    try {
      const response = await fetch('/plugins');
      let data: PluginsResponse | { error?: string };
      try {
        data = (await response.json()) as PluginsResponse | { error?: string };
      } catch {
        throw new Error(`Server error ${response.status}`);
      }
      if (response.status === 503) {
        showLoading('Plugin docs are loading, please wait...');
        return;
      }
      if (!response.ok) {
        showError(
          'Failed to load plugin docs.' + ('error' in data && data.error ? ' ' + data.error : '')
        );
        return;
      }
      pluginsData = data as PluginsResponse;
      refs.anchorBar.textContent = '';
      for (const category of pluginsData.categories) {
        const link = document.createElement('a');
        link.className = 'docs-sidebar__anchor-link';
        link.href = `#docs-section-${category.type}`;
        link.textContent = category.type.charAt(0).toUpperCase() + category.type.slice(1);
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const sectionEl = refs.pluginList.querySelector(`#docs-section-${category.type}`);
          if (sectionEl) {
            sectionEl.scrollIntoView({ behavior: 'smooth' });
          }
        });
        refs.anchorBar.appendChild(link);
      }
      render();
    } catch (err) {
      showError(
        'Failed to load plugin docs: ' + (err instanceof Error ? err.message : String(err))
      );
    }
  }

  function openSidebar(): void {
    refs.sidebar.removeAttribute('hidden');
    if (!fetchStarted) {
      fetchStarted = true;
      void fetchPlugins();
    } else if (pluginsData) {
      render();
    }
  }

  function closeSidebar(): void {
    refs.sidebar.setAttribute('hidden', '');
  }

  refs.toggleButton.addEventListener('click', () => {
    if (refs.sidebar.hasAttribute('hidden')) {
      openSidebar();
    } else {
      closeSidebar();
    }
  });

  refs.closeButton.addEventListener('click', closeSidebar);

  refs.searchInput.addEventListener('input', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = refs.searchInput.value;
      detailPlugin = null;
      render();
    }, 200);
  });
}
