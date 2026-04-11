import { describe, it, expect } from 'vitest';
import {
  detectContext,
  findFilterName,
  findFilterCallContext,
  isInsideDelimiters,
  isInsideComment,
} from './jinja2-context';

function cursorAt(text: string, marker = '▶'): [string, number, number] {
  const pos = text.indexOf(marker);
  if (pos === -1) throw new Error(`Marker '${marker}' not found in text`);
  const before = text.slice(0, pos);
  const lines = before.split('\n');
  const lineNumber = lines.length;
  const column = lines[lines.length - 1].length + 1;
  const fullText = text.slice(0, pos) + text.slice(pos + 1);
  return [fullText, lineNumber, column];
}

describe('isInsideComment', () => {
  it('returns false outside any comment', () => {
    const text = 'hello world';
    expect(isInsideComment(text, 5)).toBe(false);
  });

  it('returns true when offset is inside {# #}', () => {
    const text = '{# foo bar #}';
    expect(isInsideComment(text, 5)).toBe(true);
  });

  it('returns false at the #} closing', () => {
    const text = '{# foo #} after';
    expect(isInsideComment(text, 10)).toBe(false);
  });

  it('returns false before the comment', () => {
    const text = 'before {# comment #}';
    expect(isInsideComment(text, 2)).toBe(false);
  });
});

describe('isInsideDelimiters', () => {
  it('returns false for plain text', () => {
    const text = 'hello world';
    expect(isInsideDelimiters(text, 5)).toBe(false);
  });

  it('returns true inside {{ }}', () => {
    const text = '{{ foo | bar }}';
    expect(isInsideDelimiters(text, 6)).toBe(true);
  });

  it('returns true inside {% %}', () => {
    const text = '{% if foo %}';
    expect(isInsideDelimiters(text, 5)).toBe(true);
  });

  it('returns false after closing }}', () => {
    const text = '{{ foo }} after';
    expect(isInsideDelimiters(text, 11)).toBe(false);
  });

  it('returns true inside {{- -}}', () => {
    const text = '{{- foo -}}';
    expect(isInsideDelimiters(text, 5)).toBe(true);
  });

  it('returns true inside {%- -%}', () => {
    const text = '{%- if foo -%}';
    expect(isInsideDelimiters(text, 7)).toBe(true);
  });

  it('returns false inside {# #} comment', () => {
    const text = '{# foo | bar #}';
    expect(isInsideDelimiters(text, 7)).toBe(false);
  });
});

describe('detectContext — filter', () => {
  it('detects filter after pipe with no partial word', () => {
    const [text, line, col] = cursorAt('{{ foo | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter with partial word', () => {
    const [text, line, col] = cursorAt('{{ foo | up▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('up');
  });

  it('detects chained filter', () => {
    const [text, line, col] = cursorAt('{{ foo | lower | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter after pipe following filter with args', () => {
    const [text, line, col] = cursorAt('{{ foo | to_yaml(4) | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter with no spaces', () => {
    const [text, line, col] = cursorAt('{{foo|▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter with extra spaces', () => {
    const [text, line, col] = cursorAt('{{ foo  |  ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter in statement block', () => {
    const [text, line, col] = cursorAt('{% if foo | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
  });

  it('detects filter range correctly', () => {
    const [text, line, col] = cursorAt('{{ foo | up▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.range.endColumn).toBe(col);
    expect(ctx.range.startColumn).toBe(col - 2);
  });

  it('detects filter with FQCN partial (dots in prefix)', () => {
    const [text, line, col] = cursorAt('{{ foo | ansible.builtin.a▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('ansible.builtin.a');
  });

  it('range covers full FQCN prefix including dots', () => {
    const [text, line, col] = cursorAt('{{ foo | ansible.builtin.a▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.range.endColumn).toBe(col);
    expect(ctx.range.startColumn).toBe(col - 'ansible.builtin.a'.length);
  });
});

describe('detectContext — lookup', () => {
  it('detects lookup after lookup( with single quote', () => {
    const [text, line, col] = cursorAt("{{ lookup('▶");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('');
  });

  it('detects lookup with partial word', () => {
    const [text, line, col] = cursorAt("{{ lookup('fi▶");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('fi');
  });

  it('detects lookup after query(', () => {
    const [text, line, col] = cursorAt("{{ query('▶");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('');
  });

  it('detects lookup after q(', () => {
    const [text, line, col] = cursorAt("{{ q('▶");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('');
  });

  it('detects lookup with double quotes', () => {
    const [text, line, col] = cursorAt('{{ lookup("▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('');
  });

  it('detects lookup with spaces before paren', () => {
    const [text, line, col] = cursorAt("{{ lookup ( '▶");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('lookup');
    expect(ctx.partialWord).toBe('');
  });
});

describe('findFilterName', () => {
  it('returns word when cursor is on plugin name inside lookup()', () => {
    expect(findFilterName("{{ lookup('file', path) }}", 13)).toBe('file');
  });

  it('returns word when cursor is on plugin name inside query()', () => {
    expect(findFilterName("{{ query('url', path) }}", 12)).toBe('url');
  });
});

describe('detectContext — test', () => {
  it('detects test context after is ', () => {
    const [text, line, col] = cursorAt('{{ foo is ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('test');
    expect(ctx.partialWord).toBe('');
  });

  it('detects test context with partial word', () => {
    const [text, line, col] = cursorAt('{{ foo is de▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('test');
    expect(ctx.partialWord).toBe('de');
  });

  it('detects test context after is not ', () => {
    const [text, line, col] = cursorAt('{{ foo is not ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('test');
    expect(ctx.partialWord).toBe('');
  });

  it('detects test context after is not with partial word', () => {
    const [text, line, col] = cursorAt('{{ foo is not de▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('test');
    expect(ctx.partialWord).toBe('de');
  });

  it('detects test context with FQCN partial', () => {
    const [text, line, col] = cursorAt('{{ foo is ansible.builtin.is▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('test');
    expect(ctx.partialWord).toBe('ansible.builtin.is');
    expect(ctx.range.startColumn).toBe(col - 'ansible.builtin.is'.length);
  });
});

describe('detectContext — none', () => {
  it('returns none for plain text with pipe', () => {
    const [text, line, col] = cursorAt('hello | world▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });

  it('returns none inside {# #} comment', () => {
    const [text, line, col] = cursorAt('{# foo | bar▶ #}');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });

  it('returns none after closing }}: }} foo | ▶', () => {
    const [text, line, col] = cursorAt('{{ x }} foo | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });

  it('returns none inside string literal inside {{ }}', () => {
    const [text, line, col] = cursorAt('{{ "hello | ▶world" }}');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });

  it('returns none inside single-quoted string', () => {
    const [text, line, col] = cursorAt("{{ 'hello | ▶world' }}");
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });

  it('returns none with no delimiters', () => {
    const [text, line, col] = cursorAt('just plain text▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });
});

describe('detectContext — statement filter block', () => {
  it('detects filter context in {% filter ... %} block', () => {
    const [text, line, col] = cursorAt('{% filter ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('');
  });

  it('detects filter context in {% filter upp %} block with partial', () => {
    const [text, line, col] = cursorAt('{% filter upp▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
    expect(ctx.partialWord).toBe('upp');
  });
});

describe('detectContext — multi-line', () => {
  it('detects filter on second line after newline', () => {
    const [text, line, col] = cursorAt('{{ foo\n  | ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('filter');
  });

  it('detects none outside unclosed delimiter on next line', () => {
    const [text, line, col] = cursorAt('{{ foo }}\n| ▶');
    const ctx = detectContext(text, line, col);
    expect(ctx.type).toBe('none');
  });
});

describe('findFilterName', () => {
  it('returns filter name when cursor is on word after |', () => {
    expect(findFilterName('{{ foo | upper }}', 10)).toBe('upper');
  });

  it('returns null when cursor is on variable (not after |)', () => {
    expect(findFilterName('{{ foo | upper }}', 4)).toBeNull();
  });

  it('returns test name when cursor is after is not', () => {
    expect(findFilterName('{{ foo is not is_abs }}', 15)).toBe('is_abs');
  });

  it('returns test name when cursor is after is', () => {
    expect(findFilterName('{{ foo is defined }}', 11)).toBe('defined');
  });

  it('returns null when cursor is on whitespace', () => {
    expect(findFilterName('{{ foo | upper }}', 8)).toBeNull();
  });

  it('returns filter name with cursor at start of filter word', () => {
    expect(findFilterName('{{ x | lower }}', 8)).toBe('lower');
  });

  it('returns filter name with cursor at end of filter word', () => {
    expect(findFilterName('{{ x | lower }}', 12)).toBe('lower');
  });
});

describe('findFilterCallContext', () => {
  it('returns filter name and param 0 when cursor is right after open paren', () => {
    const [text, line, col] = cursorAt('{{ foo | to_yaml(▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).not.toBeNull();
    expect(result!.filterName).toBe('to_yaml');
    expect(result!.activeParam).toBe(0);
  });

  it('returns param 1 after first comma', () => {
    const [text, line, col] = cursorAt('{{ foo | to_yaml(indent=4, ▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).not.toBeNull();
    expect(result!.filterName).toBe('to_yaml');
    expect(result!.activeParam).toBe(1);
  });

  it('returns filter name for simple filter call', () => {
    const [text, line, col] = cursorAt('{{ foo | upper(▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).not.toBeNull();
    expect(result!.filterName).toBe('upper');
    expect(result!.activeParam).toBe(0);
  });

  it('returns null outside any call', () => {
    const [text, line, col] = cursorAt('{{ foo | ▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).toBeNull();
  });

  it('returns null in plain text', () => {
    const [text, line, col] = cursorAt('foo(▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).toBeNull();
  });

  it('handles nested parens correctly', () => {
    const [text, line, col] = cursorAt('{{ foo | join(items(x), ▶');
    const result = findFilterCallContext(text, line, col);
    expect(result).not.toBeNull();
    expect(result!.filterName).toBe('join');
    expect(result!.activeParam).toBe(1);
  });
});
