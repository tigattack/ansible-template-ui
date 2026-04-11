/**
 * Jinja2 signature help for Monaco Editor.
 *
 * Pure function `getSignatureHelp` has zero external dependencies and no Monaco types.
 * Monaco adapter `createJinja2SignatureHelpProvider` wraps it for Monaco integration.
 */

import type * as monaco from 'monaco-editor';
import { findFilterCallContext } from './jinja2-context';
import type { PluginEntry, PluginParam } from '../plugin-data';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SignatureResult {
  /** Full signature string, e.g. 'to_yaml(indent: int = 2, allow_unicode: bool = true)' */
  label: string;
  /** Plugin short_description or description */
  documentation: string;
  parameters: Array<{ label: string; documentation: string }>;
  activeParameter: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildParamLabel(p: PluginParam): string {
  let s = p.name;
  if (p.type) s += `: ${p.type}`;
  if (p.default !== null && p.default !== undefined) s += ` = ${p.default}`;
  if (p.required) s += ' (required)';
  return s;
}

function buildSignatureLabel(filterName: string, params: PluginParam[]): string {
  const paramStrs = params.map((p) => {
    let s = p.name;
    if (p.type) s += `: ${p.type}`;
    if (p.default !== null && p.default !== undefined) s += ` = ${p.default}`;
    return s;
  });
  return `${filterName}(${paramStrs.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

/**
 * Returns signature help for the cursor position, or null if not applicable.
 *
 * @param fullText    Complete document text
 * @param lineNumber  1-based line number (Monaco convention)
 * @param column      1-based column number (Monaco convention)
 * @param plugins     List of available plugin entries to match against
 */
export function getSignatureHelp(
  fullText: string,
  lineNumber: number,
  column: number,
  plugins: PluginEntry[]
): SignatureResult | null {
  const filterCallContext = findFilterCallContext(fullText, lineNumber, column);
  if (!filterCallContext) return null;

  const { filterName, activeParam } = filterCallContext;

  const plugin = plugins.find(
    (p) => p.name.split('.').pop()?.toLowerCase() === filterName.toLowerCase()
  );
  if (!plugin) return null;

  if (plugin.params.length === 0) return null;

  const label = buildSignatureLabel(filterName, plugin.params);
  const documentation = plugin.short_description ?? plugin.description ?? '';
  const parameters = plugin.params.map((p) => ({
    label: buildParamLabel(p),
    documentation: p.description,
  }));

  return { label, documentation, parameters, activeParameter: activeParam };
}

// ---------------------------------------------------------------------------
// Monaco adapter
// ---------------------------------------------------------------------------

export function createJinja2SignatureHelpProvider(
  getPlugins: () => PluginEntry[]
): monaco.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(
      model: monaco.editor.ITextModel,
      position: monaco.Position
    ): monaco.languages.SignatureHelpResult | null {
      const result = getSignatureHelp(
        model.getValue(),
        position.lineNumber,
        position.column,
        getPlugins()
      );
      if (!result) return null;
      return {
        value: {
          signatures: [
            {
              label: result.label,
              documentation: { value: result.documentation },
              parameters: result.parameters.map((p) => ({
                label: p.label,
                documentation: { value: p.documentation },
              })),
            },
          ],
          activeSignature: 0,
          activeParameter: result.activeParameter,
        },
        dispose: () => {},
      };
    },
  };
}
