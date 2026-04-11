import { describe, it, expect } from 'vitest';
import { getHoverContent } from './jinja2-hover';
import type { PluginEntry } from '../plugin-data';

const TO_YAML: PluginEntry = {
  name: 'ansible.builtin.to_yaml',
  namespace: 'ansible.builtin',
  type: 'filter',
  short_description: 'Convert to YAML',
  description:
    'Converts a data structure to B(YAML) format.\nUse C(to_yaml) filter with O(ignore:indent) option.\nSee U(https://yaml.org) for spec.',
  params: [
    {
      name: 'indent',
      description: 'Number of spaces for I(indentation). Default V(2).',
      type: 'int',
      default: '2',
      required: false,
    },
    {
      name: 'allow_unicode',
      description: 'Allow C(unicode) characters. Set to V(true) for international text.',
      type: 'bool',
      default: 'true',
      required: false,
    },
  ],
  examples:
    '# Convert variable to YAML\n{{ myvar | to_yaml }}\n\n# With custom indent\n{{ myvar | to_yaml(indent=4) }}',
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

const IS_ABS: PluginEntry = {
  name: 'ansible.builtin.is_abs',
  namespace: 'ansible.builtin',
  type: 'test',
  short_description: 'Test if number is absolute',
  description: 'Returns true if the number is a positive integer.',
  params: [],
  examples: null,
  source: 'builtin',
};

const FILE_LOOKUP: PluginEntry = {
  name: 'ansible.builtin.file',
  namespace: 'ansible.builtin',
  type: 'lookup',
  short_description: 'Read file contents',
  description: 'Returns the contents of a file on the controller.',
  params: [],
  examples: null,
  source: 'builtin',
};

const PLUGINS: PluginEntry[] = [TO_YAML, TO_JSON, IS_ABS, FILE_LOOKUP];

describe('getHoverContent', () => {
  it('returns HoverResult when hovering on to_yaml inside {{ foo | to_yaml }}', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.markdown).toBeTruthy();
  });

  it('markdown includes **to_yaml** header', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result?.markdown).toContain('**to_yaml**');
  });

  it('markdown includes FQCN `ansible.builtin.to_yaml`', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result?.markdown).toContain('`ansible.builtin.to_yaml`');
  });

  it('markdown includes description text', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result?.markdown).toContain('Converts a data structure to');
  });

  it('markdown includes params table with indent and allow_unicode rows', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result?.markdown).toContain('**Parameters:**');
    expect(result?.markdown).toContain('| indent |');
    expect(result?.markdown).toContain('| allow_unicode |');
  });

  it('markdown includes examples code block', () => {
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', PLUGINS);
    expect(result?.markdown).toContain('**Examples:**');
    expect(result?.markdown).toContain('```yaml');
  });

  it('returns HoverResult for to_json with no params section and no examples section', () => {
    const fullText = '{{ foo | to_json }}';
    const result = getHoverContent(fullText, 1, 12, 'to_json', PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.markdown).not.toContain('**Parameters:**');
    expect(result?.markdown).not.toContain('**Examples:**');
  });

  it('returns HoverResult when hovering on is_abs inside {{ foo is is_abs }}', () => {
    const fullText = '{{ foo is is_abs }}';
    const result = getHoverContent(fullText, 1, 14, 'is_abs', PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('**is_abs**');
  });

  it('returns HoverResult when hovering on lookup plugin name inside lookup()', () => {
    const fullText = "{{ lookup('file', '/etc/hosts') }}";
    const result = getHoverContent(fullText, 1, 13, 'file', PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('**file**');
  });

  it('returns null for plain text to_yaml outside delimiters', () => {
    const result = getHoverContent('to_yaml is here', 1, 5, 'to_yaml', PLUGINS);
    expect(result).toBeNull();
  });

  it('returns null when hovering on variable name foo (not after | or is)', () => {
    const result = getHoverContent('{{ foo }}', 1, 4, 'foo', PLUGINS);
    expect(result).toBeNull();
  });

  it('shows description only when description equals short_description', () => {
    const plugin: PluginEntry = {
      ...TO_JSON,
      short_description: 'Convert to JSON',
      description: 'Convert to JSON',
    };
    const fullText = '{{ foo | to_json }}';
    const result = getHoverContent(fullText, 1, 12, 'to_json', [plugin]);
    expect(result).not.toBeNull();
    const occurrences = (result?.markdown.match(/Convert to JSON/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('shows short_description when description is null', () => {
    const plugin: PluginEntry = {
      ...TO_JSON,
      short_description: 'Convert to JSON',
      description: null,
    };
    const fullText = '{{ foo | to_json }}';
    const result = getHoverContent(fullText, 1, 12, 'to_json', [plugin]);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('Convert to JSON');
  });

  it('examples with leading newline are stripped', () => {
    const plugin: PluginEntry = {
      ...TO_YAML,
      examples: '\n\n# Example\n{{ foo | to_json }}',
    };
    const fullText = '{{ foo | to_yaml }}';
    const result = getHoverContent(fullText, 1, 12, 'to_yaml', [plugin]);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('**Examples:**');
    expect(result?.markdown).not.toMatch(/```yaml\n\n/);
    expect(result?.markdown).toContain('```yaml\n# Example');
  });

  it('case-insensitive match: TO_YAML matches ansible.builtin.to_yaml', () => {
    const fullText = '{{ foo | TO_YAML }}';
    const result = getHoverContent(fullText, 1, 12, 'TO_YAML', PLUGINS);
    expect(result).not.toBeNull();
    expect(result?.markdown).toContain('`ansible.builtin.to_yaml`');
  });
});
