import { describe, it, expect } from 'vitest';
import { getCompletionItems } from './jinja2-completion';
import type { PluginEntry } from '../plugin-data';

const TO_YAML: PluginEntry = {
  name: 'ansible.builtin.to_yaml',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to YAML',
  description: 'Converts a data structure to YAML format.',
  params: [
    {
      name: 'indent',
      description: 'Indentation spaces.',
      type: 'int',
      default: '2',
      required: false,
    },
    {
      name: 'allow_unicode',
      description: 'Allow unicode.',
      type: 'bool',
      default: 'true',
      required: false,
    },
  ],
  examples: '# Convert variable to YAML\n{{ myvar | to_yaml }}',
  source: 'builtin',
};

const TO_JSON: PluginEntry = {
  name: 'ansible.builtin.to_json',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to JSON',
  description: 'Converts a data structure to JSON format.',
  params: [],
  examples: null,
  source: 'builtin',
};

const FILE_LOOKUP: PluginEntry = {
  name: 'ansible.builtin.file',
  namespace: 'ansible.builtin',
  type: 'lookup',
  short_description: 'Read file contents',
  description: 'Returns the contents of a file.',
  params: [],
  examples: null,
  source: 'builtin',
};

const IS_ABS: PluginEntry = {
  name: 'ansible.builtin.is_abs',
  namespace: 'ansible.builtin',
  type: 'test',
  short_description: 'Test if path is absolute',
  description: 'Returns true if the path is absolute.',
  params: [],
  examples: null,
  source: 'builtin',
};

const ALL_PLUGINS: PluginEntry[] = [TO_YAML, TO_JSON, FILE_LOOKUP, IS_ABS];

describe('getCompletionItems', () => {
  it('returns filter completions after "{{ foo | "', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.to_yaml');
    expect(labels).toContain('ansible.builtin.to_json');
    expect(results.every((r) => r.kind === 'filter')).toBe(true);
  });

  it('filters by prefix "to" in "{{ foo | to"', () => {
    const text = '{{ foo | to';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.to_yaml');
    expect(labels).toContain('ansible.builtin.to_json');
    expect(labels).not.toContain('ansible.builtin.is_abs');
    expect(labels).not.toContain('ansible.builtin.file');
  });

  it('case-insensitive prefix match with "TO"', () => {
    const text = '{{ foo | TO';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.to_yaml');
    expect(labels).toContain('ansible.builtin.to_json');
  });

  it('to_yaml (has params) → isSnippet true and insertText includes $1', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml).toBeDefined();
    expect(toYaml!.isSnippet).toBe(true);
    expect(toYaml!.insertText).toBe('to_yaml($1)');
  });

  it('to_json (no params) → isSnippet false and insertText is plain', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toJson = results.find((r) => r.label === 'ansible.builtin.to_json');
    expect(toJson).toBeDefined();
    expect(toJson!.isSnippet).toBe(false);
    expect(toJson!.insertText).toBe('to_json');
  });

  it('returns lookup completions after "{{ lookup(\'"', () => {
    const text = "{{ lookup('";
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.file');
    expect(results.every((r) => r.kind === 'lookup')).toBe(true);
  });

  it('returns test completions after "{{ foo is "', () => {
    const text = '{{ foo is ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.is_abs');
    expect(results.every((r) => r.kind === 'test')).toBe(true);
  });

  it('returns [] for plain text (no Jinja2 delimiters)', () => {
    const text = 'hello | world';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    expect(results).toEqual([]);
  });

  it('returns [] for plain text with no Jinja2 delimiters (single word)', () => {
    const text = 'to_yaml';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    expect(results).toEqual([]);
  });

  it('returns [] for pipe-separated text outside Jinja2 delimiters', () => {
    const text = 'hello | to';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    expect(results).toEqual([]);
  });

  it('returns [] when plugins array is empty', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, []);
    expect(results).toEqual([]);
  });

  it('label is the FQCN, not the short name', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml).toBeDefined();
    expect(toYaml!.label).toBe('ansible.builtin.to_yaml');
  });

  it('detail is the FQCN (shown as docs pane title)', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml).toBeDefined();
    expect(toYaml!.detail).toBe('ansible.builtin.to_yaml');
  });

  it('documentation includes description and params for to_yaml', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml).toBeDefined();
    expect(toYaml!.documentation).toContain('Converts a data structure to YAML format\\.');
    expect(toYaml!.documentation).toContain('**Parameters:**');
    expect(toYaml!.documentation).toContain('`indent`');
  });

  it('filterText is the short name', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml?.filterText).toBe('to_yaml');
  });

  it('insertText remains the short name even though label is FQCN', () => {
    const text = '{{ foo | ';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const toYaml = results.find((r) => r.label === 'ansible.builtin.to_yaml');
    expect(toYaml?.insertText).toBe('to_yaml($1)');
  });

  it('filters by FQCN prefix "ansible.builtin.to"', () => {
    const text = '{{ foo | ansible.builtin.to';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    const labels = results.map((r) => r.label);
    expect(labels).toContain('ansible.builtin.to_yaml');
    expect(labels).toContain('ansible.builtin.to_json');
  });

  it('returns [] when partial matches no plugins', () => {
    const text = '{{ foo | up';
    const results = getCompletionItems(text, 1, text.length + 1, ALL_PLUGINS);
    expect(results).toEqual([]);
  });
});
