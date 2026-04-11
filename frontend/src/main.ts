import './styles.css';
import { setupMonacoEnvironment, createEditors } from './editor.ts';
import { renderTemplate, type DomRefs } from './api.ts';
import { setupKeyboardShortcuts } from './keyboard.ts';
import { initDocsSidebar, type DocsSidebarRefs } from './docs-sidebar.ts';

setupMonacoEnvironment();
const { variablesEditor, templateEditor } = createEditors();

let isRaw = false;
const rawToggle = document.getElementById('raw-toggle') as HTMLInputElement;
const renderButton = document.getElementById('render-button') as HTMLButtonElement;
const isMac = /mac/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform
);
const shortcutHint = isMac ? '⌘↵' : 'Ctrl↵';
renderButton.innerHTML = `Render <kbd>${shortcutHint}</kbd>`;

const dom: DomRefs = {
  renderOutput: document.getElementById('render-output')!,
  errorDisplay: document.getElementById('error-display')!,
  warmupDisplay: document.getElementById('warmup-display')!,
  renderButton,
  shortcutHint,
};

rawToggle.addEventListener('change', () => (isRaw = rawToggle.checked));
const render = () => void renderTemplate(templateEditor, variablesEditor, isRaw, dom);

renderButton.addEventListener('click', render);

setupKeyboardShortcuts(variablesEditor, templateEditor, render);

const docsSidebarRefs: DocsSidebarRefs = {
  sidebar: document.getElementById('docs-sidebar')!,
  resizeHandle: document.querySelector('.docs-sidebar__resize-handle') as HTMLElement,
  toggleButton: document.getElementById('docs-toggle') as HTMLButtonElement,
  closeButton: document.getElementById('docs-close') as HTMLButtonElement,
  searchInput: document.getElementById('docs-search') as HTMLInputElement,
  pluginList: document.getElementById('docs-plugin-list')!,
  loadingDisplay: document.getElementById('docs-loading')!,
  errorDisplay: document.getElementById('docs-error')!,
  anchorBar: document.querySelector('.docs-sidebar__anchor-bar') as HTMLElement,
};
initDocsSidebar(docsSidebarRefs);
