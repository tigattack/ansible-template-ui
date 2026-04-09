import type * as monaco from 'monaco-editor';

export interface DomRefs {
  renderOutput: HTMLElement;
  errorDisplay: HTMLElement;
  warmupDisplay: HTMLElement;
  renderButton: HTMLButtonElement;
  shortcutHint: string;
}

export async function renderTemplate(
  templateEditor: monaco.editor.IStandaloneCodeEditor,
  variablesEditor: monaco.editor.IStandaloneCodeEditor,
  isRaw: boolean,
  dom: DomRefs
): Promise<void> {
  dom.renderButton.disabled = true;
  dom.renderButton.textContent = 'Rendering…';
  dom.renderOutput.textContent = '';
  dom.errorDisplay.textContent = '';
  dom.errorDisplay.style.display = 'none';
  dom.warmupDisplay.textContent = '';
  dom.warmupDisplay.style.display = 'none';

  try {
    let template = templateEditor.getValue();
    if (isRaw) {
      template = '{{ ' + template + ' }}';
    }

    const response = await fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template,
        variables: variablesEditor.getValue(),
      }),
    });

    let data: { content?: string; error?: string };
    try {
      data = (await response.json()) as { content?: string; error?: string };
    } catch {
      throw new Error(`Server error ${response.status}`);
    }

    if (response.status === 503) {
      dom.warmupDisplay.textContent = data.error ?? '';
      dom.warmupDisplay.style.display = 'block';
    } else if (response.ok) {
      dom.renderOutput.textContent = data.content ?? '';
    } else {
      dom.errorDisplay.textContent = 'Error: ' + (data.error ?? 'Unknown error');
      dom.errorDisplay.style.display = 'block';
    }
  } catch (err) {
    dom.errorDisplay.textContent = 'Error: ' + (err instanceof Error ? err.message : String(err));
    dom.errorDisplay.style.display = 'block';
  } finally {
    dom.renderButton.disabled = false;
    dom.renderButton.innerHTML = `Render <kbd>${dom.shortcutHint}</kbd>`;
  }
}
