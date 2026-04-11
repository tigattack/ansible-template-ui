import type * as monaco from 'monaco-editor';
import type { PluginEntry } from '../plugin-data';
import { getPluginDescription, getPluginExamples } from '../plugin-data';
import { formatAnsibleMarkupMD } from '../format-ansible-markup';
import { detectContext, isInsideDelimiters } from './jinja2-context';

export interface CompletionResult {
  label: string;
  detail: string;
  documentation: string;
  kind: 'filter' | 'lookup' | 'test';
  insertText: string;
  isSnippet: boolean;
  filterText: string;
  range: { startColumn: number; endColumn: number };
}

function buildDocumentation(plugin: PluginEntry): string {
  const parts: string[] = [];
  const desc = getPluginDescription(plugin);
  if (desc) parts.push(formatAnsibleMarkupMD(desc));
  if (plugin.params.length > 0) {
    parts.push('\n**Parameters:**');
    for (const p of plugin.params) {
      let paramLine = `- \`${p.name}\``;
      if (p.type) paramLine += ` _(${p.type})_`;
      if (p.default !== null && p.default !== undefined) paramLine += ` = ${p.default}`;
      if (p.required) paramLine += ' **(required)**';
      if (p.description) paramLine += `: ${formatAnsibleMarkupMD(p.description)}`;
      parts.push(paramLine);
    }
  }
  const examples = getPluginExamples(plugin);
  if (examples) {
    parts.push('\n**Examples:**\n```yaml\n' + examples + '\n```');
  }
  return parts.join('\n');
}

export function getCompletionItems(
  fullText: string,
  lineNumber: number,
  column: number,
  plugins: PluginEntry[]
): CompletionResult[] {
  const context = detectContext(fullText, lineNumber, column);
  const lines = fullText.split('\n');
  const currentLine = lines[lineNumber - 1] ?? '';
  const beforeCursor = currentLine.slice(0, column - 1);
  const fallbackFilterPrefix = beforeCursor
    .slice(beforeCursor.lastIndexOf('|') + 1)
    .trimStart()
    .toLowerCase();

  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) offset += (lines[i]?.length ?? 0) + 1;
  offset += column - 1;

  let kind = context.type;
  let typedPrefix = context.partialWord.toLowerCase();

  if (kind === 'none') {
    if (isInsideDelimiters(fullText, offset) && /^[\w.]+$/.test(fallbackFilterPrefix)) {
      kind = 'filter';
      typedPrefix = fallbackFilterPrefix;
    } else {
      return [];
    }
  } else if (kind === 'filter' && fallbackFilterPrefix.includes('.')) {
    typedPrefix = fallbackFilterPrefix;
  }

  return plugins
    .filter((plugin) => plugin.type === kind)
    .filter((plugin) => {
      const shortName = plugin.name.split('.').pop() ?? plugin.name;
      return (
        typedPrefix === '' ||
        shortName.toLowerCase().startsWith(typedPrefix) ||
        plugin.name.toLowerCase().startsWith(typedPrefix)
      );
    })
    .map((plugin): CompletionResult => {
      const shortName = plugin.name.split('.').pop() ?? plugin.name;
      const isFilterWithParams = kind === 'filter' && plugin.params.length > 0;
      return {
        label: plugin.name,
        detail: plugin.name,
        documentation: buildDocumentation(plugin),
        kind,
        insertText: isFilterWithParams ? `${shortName}($1)` : shortName,
        isSnippet: isFilterWithParams,
        filterText: shortName,
        range: context.range,
      };
    });
}

export function createJinja2CompletionProvider(
  getPlugins: () => PluginEntry[]
): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['|', "'", '"', ' '],
    provideCompletionItems(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.CompletionList {
      const results = getCompletionItems(
        model.getValue(),
        position.lineNumber,
        position.column,
        getPlugins()
      );
      if (results.length === 0) return { suggestions: [] };
      const KIND_FUNCTION = 1;
      const KIND_REFERENCE = 21;
      const KIND_KEYWORD = 17;
      const INSERT_AS_SNIPPET = 4;
      const suggestions: monaco.languages.CompletionItem[] = results.map((r) => ({
        label: r.label,
        kind:
          r.kind === 'filter' ? KIND_FUNCTION : r.kind === 'lookup' ? KIND_REFERENCE : KIND_KEYWORD,
        detail: r.detail,
        documentation: { value: r.documentation },
        insertText: r.insertText,
        filterText: r.filterText,
        insertTextRules: r.isSnippet ? INSERT_AS_SNIPPET : undefined,
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: r.range.startColumn,
          endColumn: r.range.endColumn,
        },
      }));
      return { suggestions };
    },
  };
}
