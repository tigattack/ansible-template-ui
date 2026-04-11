import type * as monaco from 'monaco-editor';
import type { PluginEntry } from '../plugin-data';
import { getPluginDescription, getPluginExamples } from '../plugin-data';
import { formatAnsibleMarkupMD } from '../format-ansible-markup';
import { isInsideDelimiters, findFilterName } from './jinja2-context';

export interface HoverResult {
  markdown: string;
  range: { startColumn: number; endColumn: number };
}

function buildHoverMarkdown(plugin: PluginEntry): string {
  const shortName = plugin.name.split('.').pop() ?? plugin.name;
  const parts: string[] = [];

  parts.push(`**${shortName}** _(${plugin.source})_`);
  parts.push(`\`${plugin.name}\``);

  const desc = getPluginDescription(plugin);
  if (desc) parts.push(formatAnsibleMarkupMD(desc));

  if (plugin.params.length > 0) {
    parts.push(
      '**Parameters:**\n| Name | Type | Default | Required | Description |\n|------|------|---------|----------|-------------|'
    );
    for (const p of plugin.params) {
      const type = p.type ?? '';
      const def = p.default !== null && p.default !== undefined ? p.default : '';
      const req = p.required ? 'yes' : 'no';
      const desc = formatAnsibleMarkupMD(p.description);
      parts.push(`| ${p.name} | ${type} | ${def} | ${req} | ${desc} |`);
    }
  }

  const examples = getPluginExamples(plugin);
  if (examples) {
    parts.push(`**Examples:**\n\`\`\`yaml\n${examples}\n\`\`\``);
  }

  return parts.join('\n\n');
}

export function getHoverContent(
  fullText: string,
  lineNumber: number,
  column: number,
  word: string,
  plugins: PluginEntry[]
): HoverResult | null {
  const lines = fullText.split('\n');
  let offset = 0;
  for (let i = 0; i < lineNumber - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  offset += column - 1;

  if (!isInsideDelimiters(fullText, offset)) return null;

  const lineText = lines[lineNumber - 1] ?? '';
  if (!findFilterName(lineText, column)) return null;

  const lowerWord = word.toLowerCase();
  const plugin = plugins.find((p) => p.name.split('.').pop()?.toLowerCase() === lowerWord);
  if (!plugin) return null;

  return {
    markdown: buildHoverMarkdown(plugin),
    range: { startColumn: column - word.length, endColumn: column },
  };
}

export function createJinja2HoverProvider(
  getPlugins: () => PluginEntry[]
): monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const wordObj = model.getWordAtPosition(position);
      if (!wordObj) return null;
      const result = getHoverContent(
        model.getValue(),
        position.lineNumber,
        position.column,
        wordObj.word,
        getPlugins()
      );
      if (!result) return null;
      return {
        contents: [{ value: result.markdown }],
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: result.range.startColumn,
          endColumn: result.range.endColumn,
        },
      };
    },
  };
}
