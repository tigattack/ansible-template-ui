import * as monaco from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
import { registerJinja2Language } from './languages/jinja2.ts';

import type { IWebWorkerOptions } from 'monaco-editor';

// monaco-worker-manager (used by monaco-yaml) calls monaco.editor.createWebWorker
// without the `worker` property required since monaco-editor v0.55.0.
// This wraps the internal API to resolve the worker via MonacoEnvironment.getWorker
// before forwarding. Safe to remove once monaco-worker-manager ships a fix (stale since 2022).
let _createWebWorkerPatched = false;
function patchCreateWebWorker(): void {
  if (_createWebWorkerPatched) return;
  _createWebWorkerPatched = true;

  const rawCreateWebWorker = monaco.editor.createWebWorker.bind(monaco.editor);

  type InternalOpts = { worker?: Worker | Promise<Worker> };

  (monaco.editor as Record<string, unknown>).createWebWorker = <T extends object>(
    opts: IWebWorkerOptions & InternalOpts
  ): monaco.editor.MonacoWebWorker<T> => {
    if (opts.worker) {
      return rawCreateWebWorker<T>(opts as Parameters<typeof rawCreateWebWorker<T>>[0]);
    }

    const label = opts.label ?? 'monaco-editor-worker';
    const workerInstance = window.MonacoEnvironment?.getWorker?.('workerMain.js', label);
    if (!workerInstance) {
      throw new Error(`MonacoEnvironment.getWorker returned nothing for label "${label}"`);
    }
    const worker = Promise.resolve(workerInstance).then((w) => {
      w.postMessage('ignore');
      w.postMessage(opts.createData);
      return w;
    });
    return rawCreateWebWorker<T>({ worker, host: opts.host, keepIdleModels: opts.keepIdleModels });
  };
}

export function setupMonacoEnvironment(): void {
  (window as unknown as Record<string, unknown>).monaco = monaco;

  window.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'yaml') {
        return new Worker(new URL('./yaml.worker.ts', import.meta.url), { type: 'module' });
      }
      return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
        type: 'module',
      });
    },
  };

  patchCreateWebWorker();
  registerJinja2Language(monaco);
  configureMonacoYaml(monaco, { enableSchemaRequest: false });
}

export interface Editors {
  variablesEditor: monaco.editor.IStandaloneCodeEditor;
  templateEditor: monaco.editor.IStandaloneCodeEditor;
}

export function createEditors(): Editors {
  const variablesEditor = monaco.editor.create(document.getElementById('variables-editor')!, {
    value: 'foo: bar',
    language: 'yaml',
    theme: 'vs-dark',
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
  });

  const templateEditor = monaco.editor.create(document.getElementById('template-editor')!, {
    value: '{{ foo }}',
    language: 'jinja2',
    theme: 'vs-dark',
    wordWrap: 'on',
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
  });

  return { variablesEditor, templateEditor };
}
