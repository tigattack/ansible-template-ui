import { describe, it, expect } from 'vitest';
import { formatAnsibleMarkup } from './format-ansible-markup';

describe('formatAnsibleMarkup', () => {
  it('returns empty string for null', () => {
    expect(formatAnsibleMarkup(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatAnsibleMarkup(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatAnsibleMarkup('')).toBe('');
  });

  it('wraps plain text in a paragraph element', () => {
    const result = formatAnsibleMarkup('Hello world');
    expect(result).toContain('<p>');
    expect(result).toContain('Hello world');
    expect(result).toContain('</p>');
  });

  it('renders B(bold) as bold element', () => {
    const result = formatAnsibleMarkup('B(bold text)');
    expect(result).toMatch(/<b>|<strong>/);
    expect(result).toContain('bold text');
  });

  it('renders I(italic) as italic element', () => {
    const result = formatAnsibleMarkup('I(italic text)');
    expect(result).toMatch(/<em>|<i>/);
    expect(result).toContain('italic text');
  });

  it('renders C(code) as code element', () => {
    const result = formatAnsibleMarkup('C(my_variable)');
    expect(result).toContain('<code>');
    expect(result).toContain('my_variable');
  });

  it('renders V(value) as code element', () => {
    const result = formatAnsibleMarkup('V(some_value)');
    expect(result).toContain('<code>');
    expect(result).toContain('some_value');
  });

  it('renders O(option) as styled code element', () => {
    const result = formatAnsibleMarkup('O(ignore:my_option)');
    expect(result).toContain('<code>');
    expect(result).toContain('my_option');
  });

  it('renders E(ENV_VAR) as code element', () => {
    const result = formatAnsibleMarkup('E(HOME)');
    expect(result).toContain('<code>');
    expect(result).toContain('HOME');
  });

  it('renders U(url) as anchor with correct href', () => {
    const result = formatAnsibleMarkup('U(https://example.com)');
    expect(result).toContain('<a href=');
    expect(result).toContain('https://example.com');
  });

  it('renders L(text, url) as anchor with text and href', () => {
    const result = formatAnsibleMarkup('L(Docs, https://example.com)');
    expect(result).toContain('<a href=');
    expect(result).toContain('https://example.com');
    expect(result).toContain('Docs');
  });

  it('converts single backticks to code elements', () => {
    const result = formatAnsibleMarkup('`my_var`');
    expect(result).toContain('<code>');
    expect(result).toContain('my_var');
  });

  it('escapes XSS: does not output literal <script> tag', () => {
    const result = formatAnsibleMarkup('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('splits on newlines producing multiple paragraph elements', () => {
    const result = formatAnsibleMarkup('Line one\nLine two');
    const pCount = (result.match(/<p>/g) ?? []).length;
    expect(pCount).toBeGreaterThanOrEqual(2);
  });

  it('renders mixed markup with both bold and code elements', () => {
    const result = formatAnsibleMarkup('Use B(this) with C(that) option');
    expect(result).toMatch(/<b>|<strong>/);
    expect(result).toContain('<code>');
  });

  it('renders M(fqcn) without a broken empty href', () => {
    const result = formatAnsibleMarkup('M(ansible.builtin.debug)');
    expect(result).not.toContain('<a href="">');
    expect(result).not.toContain("href=''");
    expect(result).toContain('ansible.builtin.debug');
  });

  it('does not convert triple backticks to code markup', () => {
    const result = formatAnsibleMarkup('```block```');
    expect(result).not.toContain('<code>block</code>');
  });

  it('renders backtick text with correct content inside code tags', () => {
    const result = formatAnsibleMarkup('Run `ansible-playbook` now');
    expect(result).toContain('<code>');
    expect(result).toContain('ansible-playbook');
    expect(result).toContain('now');
  });
});
