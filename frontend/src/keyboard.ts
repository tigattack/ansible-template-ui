import * as monaco from 'monaco-editor';

export function setupKeyboardShortcuts(
  variablesEditor: monaco.editor.IStandaloneCodeEditor,
  templateEditor: monaco.editor.IStandaloneCodeEditor,
  onRender: () => void
): void {
  const KM = monaco.KeyMod;
  const KC = monaco.KeyCode;
  variablesEditor.addCommand(KM.CtrlCmd | KC.Enter, () => {
    onRender();
  });
  templateEditor.addCommand(KM.CtrlCmd | KC.Enter, () => {
    onRender();
  });
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRender();
    }
  });
}
