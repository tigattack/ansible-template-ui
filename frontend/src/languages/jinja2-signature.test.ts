import { describe, it, expect } from 'vitest';
import { getSignatureHelp } from './jinja2-signature';
import type { PluginEntry } from '../plugin-data';

const TO_YAML_PLUGIN: PluginEntry = {
  name: 'ansible.builtin.to_yaml',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to YAML',
  description: 'Converts a data structure to YAML format.',
  params: [
    {
      name: 'indent',
      description: 'Number of spaces for indentation. Default 2.',
      type: 'int',
      default: '2',
      required: false,
    },
    {
      name: 'allow_unicode',
      description: 'Allow unicode characters. Set to true for international text.',
      type: 'bool',
      default: 'true',
      required: false,
    },
  ],
  examples: null,
  source: 'builtin',
};

const TO_JSON_PLUGIN: PluginEntry = {
  name: 'ansible.builtin.to_json',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to JSON',
  description: 'Converts a data structure to JSON format.',
  params: [],
  examples: null,
  source: 'builtin',
};

const UPPER_PLUGIN: PluginEntry = {
  name: 'ansible.builtin.upper',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to uppercase',
  description: 'Converts a string to uppercase.',
  params: [],
  examples: null,
  source: 'builtin',
};

const PLUGINS: PluginEntry[] = [TO_YAML_PLUGIN, TO_JSON_PLUGIN, UPPER_PLUGIN];

describe('getSignatureHelp', () => {
  it('returns signature for to_yaml( with cursor after open paren', () => {
    const text = '{{ foo | to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.label).toBe('to_yaml(indent: int = 2, allow_unicode: bool = true)');
    expect(result?.activeParameter).toBe(0);
  });

  it('returns activeParameter 1 after first comma in to_yaml call', () => {
    const text = '{{ foo | to_yaml(indent=4, ';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.activeParameter).toBe(1);
  });

  it('returns null when cursor is after closing paren', () => {
    const text = '{{ foo | to_yaml(indent=4) }}';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).toBeNull();
  });

  it('returns null for to_json which has no params', () => {
    const text = '{{ foo | to_json(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).toBeNull();
  });

  it('returns null for upper which has no params', () => {
    const text = '{{ foo | upper(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).toBeNull();
  });

  it('returns null for to_yaml( in plain text outside {{ }}', () => {
    const text = 'to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).toBeNull();
  });

  it('parameters array has correct labels', () => {
    const text = '{{ foo | to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result?.parameters).toHaveLength(2);
    expect(result?.parameters[0].label).toBe('indent: int = 2');
    expect(result?.parameters[1].label).toBe('allow_unicode: bool = true');
  });

  it('parameter documentation matches PluginParam.description', () => {
    const text = '{{ foo | to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result?.parameters[0].documentation).toBe(TO_YAML_PLUGIN.params[0].description);
    expect(result?.parameters[1].documentation).toBe(TO_YAML_PLUGIN.params[1].description);
  });

  it('signature documentation equals plugin.short_description', () => {
    const text = '{{ foo | to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result?.documentation).toBe(TO_YAML_PLUGIN.short_description);
  });

  it('returns null for unknown filter name', () => {
    const text = '{{ foo | nonexistent(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).toBeNull();
  });

  it('matches filter name case-insensitively', () => {
    const text = '{{ foo | TO_YAML(';
    const result = getSignatureHelp(text, 1, text.length + 1, PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.label).toBe('TO_YAML(indent: int = 2, allow_unicode: bool = true)');
  });

  it('uses description as fallback when short_description is null', () => {
    const pluginNoShortDesc: PluginEntry = {
      ...TO_YAML_PLUGIN,
      short_description: null,
    };
    const text = '{{ foo | to_yaml(';
    const result = getSignatureHelp(text, 1, text.length + 1, [pluginNoShortDesc]);
    expect(result?.documentation).toBe(TO_YAML_PLUGIN.description);
  });
});
