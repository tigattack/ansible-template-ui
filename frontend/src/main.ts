import './styles.css';
import { setupMonacoEnvironment, createEditors } from './editor.ts';
import { renderTemplate, type DomRefs } from './api.ts';
import { setupKeyboardShortcuts } from './keyboard.ts';

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
