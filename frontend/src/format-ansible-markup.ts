/*
 * Ansible documentation markup → HTML converter.
 *
 * Wraps the `antsibull-docs` parse/toHTML pipeline with backtick
 * pre-processing and null-safety.
 */

import { parse, toHTML, toMD } from 'antsibull-docs';

/**
 * Convert Ansible documentation markup to HTML.
 *
 * - Returns `''` for null, undefined, or empty input.
 * - Pre-processes single-backtick inline code (`` `text` `` → `C(text)`)
 *   before handing the string to the antsibull-docs parser.
 * - Splits on `\n` so each line becomes its own paragraph.
 * - Uses `style: 'plain'` to emit bare HTML without Sphinx CSS classes.
 */
export function formatAnsibleMarkup(text: string | null | undefined): string {
  if (!text) {
    return '';
  }

  // Pre-process single-backtick inline code → C(…) before parsing.
  // Negative lookahead/lookbehind ensures we only match truly isolated
  // single backticks and not the inner pair inside ```triple``` blocks.
  const preprocessed = text.replace(/(?<!`)`([^`]+)`(?!`)/g, 'C($1)');

  const paragraphs = preprocessed.split('\n');
  const parsed = parse(paragraphs);
  return toHTML(parsed, { style: 'plain' });
}

/**
 * Convert Ansible documentation markup to Markdown.
 *
 * Same null-safety and backtick preprocessing as formatAnsibleMarkup,
 * but emits Markdown instead of HTML (for use in Monaco tooltips).
 */
export function formatAnsibleMarkupMD(text: string | null | undefined): string {
  if (!text) {
    return '';
  }

  const preprocessed = text.replace(/(?<!`)`([^`]+)`(?!`)/g, 'C($1)');

  const paragraphs = preprocessed.split('\n');
  const parsed = parse(paragraphs);
  return toMD(parsed);
}
