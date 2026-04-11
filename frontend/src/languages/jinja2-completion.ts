import type * as monaco from 'monaco-editor';
import type { PluginEntry } from '../plugin-data';
import { getPluginDescription, getPluginExamples } from '../plugin-data';
import { formatAnsibleMarkupMD } from '../format-ansible-markup';
import { detectContext, findFilterCallContext, isInsideDelimiters } from './jinja2-context';

export interface CompletionResult {
  label: string;
  detail: string;
  documentation: string;
  kind: 'filter' | 'lookup' | 'test' | 'param';
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

function getUsedParamNames(fullText: string, lineNumber: number, column: number): Set<string> {
  const lines = fullText.split('\n');
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) offset += (lines[i]?.length ?? 0) + 1;
  offset += column - 1;

  let depth = 0;
  let openParenOffset = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = fullText[i];
    if (ch === ')') depth++;
    else if (ch === '(') {
      if (depth === 0) {
        openParenOffset = i;
        break;
      }
      depth--;
    }
  }
  if (openParenOffset < 0) return new Set();

  const inside = fullText.slice(openParenOffset + 1, offset);
  const used = new Set<string>();
  for (const m of inside.matchAll(/([a-zA-Z_]\w*)\s*=/g)) {
    used.add(m[1]);
  }
  return used;
}

export function getCompletionItems(
  fullText: string,
  lineNumber: number,
  column: number,
  plugins: PluginEntry[]
): CompletionResult[] {
  const filterCall = findFilterCallContext(fullText, lineNumber, column);
  if (filterCall) {
    const plugin = plugins.find(
      (p) =>
        p.type === 'filter' &&
        (p.name.split('.').pop()?.toLowerCase() === filterCall.filterName.toLowerCase() ||
          p.name.toLowerCase() === filterCall.filterName.toLowerCase())
    );
    if (plugin && plugin.params.length > 0) {
      const lines = fullText.split('\n');
      const currentLine = lines[lineNumber - 1] ?? '';
      const beforeCursor = currentLine.slice(0, column - 1);
      const paramPrefixMatch = beforeCursor.match(/([a-zA-Z_]\w*)$/);
      const typedPrefix = paramPrefixMatch ? paramPrefixMatch[1].toLowerCase() : '';
      const startColumn = column - typedPrefix.length;

      const usedParams = getUsedParamNames(fullText, lineNumber, column);

      return plugin.params
        .filter((p) => !usedParams.has(p.name))
        .filter((p) => typedPrefix === '' || p.name.toLowerCase().startsWith(typedPrefix))
        .map((p) => {
          let detail = plugin.name;
          if (p.type) detail = `${p.type} — ${detail}`;

          let doc = p.description ?? '';
          if (p.default !== null && p.default !== undefined) doc += `\n\nDefault: \`${p.default}\``;
          if (p.required) doc += '\n\n**(required)**';

          return {
            label: p.name,
            detail,
            documentation: doc,
            kind: 'param' as const,
            insertText: `${p.name}=`,
            isSnippet: false,
            filterText: p.name,
            range: { startColumn, endColumn: column },
          };
        });
    }
  }

  // --- Plugin name completions (filters, lookups, tests) ---
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
  let range = context.range;

  if (kind === 'none') {
    if (isInsideDelimiters(fullText, offset) && /^[\w.]+$/.test(fallbackFilterPrefix)) {
      kind = 'filter';
      typedPrefix = fallbackFilterPrefix;
      range = { startColumn: column - fallbackFilterPrefix.length, endColumn: column };
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
        insertText: isFilterWithParams ? `${plugin.name}($1)` : plugin.name,
        isSnippet: isFilterWithParams,
        filterText: `${shortName} ${plugin.name}`,
        range,
      };
    });
}

export function createJinja2CompletionProvider(
  getPlugins: () => PluginEntry[]
): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['|', "'", '"', ' ', '(', ','],
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
      const KIND_FIELD = 4;
      const INSERT_AS_SNIPPET = 4;
      const kindMap = {
        filter: KIND_FUNCTION,
        lookup: KIND_REFERENCE,
        test: KIND_KEYWORD,
        param: KIND_FIELD,
      };
      const suggestions: monaco.languages.CompletionItem[] = results.map((r) => ({
        label: r.label,
        kind: kindMap[r.kind],
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
