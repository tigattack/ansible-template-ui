/**
 * Jinja2 cursor context detection for Monaco Editor completions.
 *
 * Pure string-scanning functions — zero external dependencies, no Monaco types.
 *
 * Context types:
 *   'filter'  — cursor is after `|` inside `{{ }}` or `{% %}`
 *   'lookup'  — cursor is inside first string arg of lookup()/query()/q()
 *   'test'    — cursor is after `is ` or `is not ` inside `{{ }}` or `{% %}`
 *   'none'    — plain text, comment, non-plugin string, outside delimiters
 */

export type Jinja2Context = {
  type: 'filter' | 'lookup' | 'test' | 'none';
  partialWord: string;
  range: { startColumn: number; endColumn: number };
};

// ---------------------------------------------------------------------------
// Offset helpers
// ---------------------------------------------------------------------------

/**
 * Convert 1-based (lineNumber, column) to a zero-based character offset into fullText.
 */
function toOffset(fullText: string, lineNumber: number, column: number): number {
  const lines = fullText.split('\n');
  let offset = 0;
  // Sum lengths of all lines before lineNumber (plus their newlines)
  for (let i = 0; i < lineNumber - 1; i++) {
    offset += (lines[i]?.length ?? 0) + 1; // +1 for the '\n'
  }
  offset += column - 1; // column is 1-based
  return offset;
}

// ---------------------------------------------------------------------------
// Delimiter / comment / string helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `offset` is inside a `{# ... #}` comment block.
 */
export function isInsideComment(fullText: string, offset: number): boolean {
  let i = 0;
  while (i < offset) {
    if (fullText[i] === '{' && fullText[i + 1] === '#') {
      i += 2;
      while (true) {
        if (i >= offset) return true;
        if (i >= fullText.length) break;
        if (fullText[i] === '#' && fullText[i + 1] === '}') {
          i += 2;
          break;
        }
        i++;
      }
    } else {
      i++;
    }
  }
  return false;
}

/**
 * Returns true if `offset` is inside an unclosed `{{...` or `{%...` block
 * (not inside a `{# #}` comment). Handles whitespace-control variants.
 */
export function isInsideDelimiters(fullText: string, offset: number): boolean {
  let i = 0;
  while (i < offset) {
    const ch = fullText[i];
    const next = fullText[i + 1];

    // Skip comments entirely
    if (ch === '{' && next === '#') {
      i += 2;
      while (i < fullText.length) {
        if (fullText[i] === '#' && fullText[i + 1] === '}') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Expression opener: {{ or {{-
    if (ch === '{' && next === '{') {
      i += 2;
      if (fullText[i] === '-') i++;

      while (true) {
        if (i >= offset) return true;
        if (i >= fullText.length) break;

        const c = fullText[i];
        const n = fullText[i + 1];

        if (c === '"' || c === "'") {
          const quote = c;
          i++;
          while (i < fullText.length && fullText[i] !== quote) {
            if (fullText[i] === '\\') i++;
            i++;
          }
          i++;
          continue;
        }

        if ((c === '-' && n === '}' && fullText[i + 2] === '}') || (c === '}' && n === '}')) {
          i += c === '-' ? 3 : 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Statement opener: {% or {%-
    if (ch === '{' && next === '%') {
      i += 2;
      if (fullText[i] === '-') i++;

      while (true) {
        if (i >= offset) return true;
        if (i >= fullText.length) break;

        const c = fullText[i];
        const n = fullText[i + 1];

        if (c === '"' || c === "'") {
          const quote = c;
          i++;
          while (i < fullText.length && fullText[i] !== quote) {
            if (fullText[i] === '\\') i++;
            i++;
          }
          i++;
          continue;
        }

        if ((c === '-' && n === '%' && fullText[i + 2] === '}') || (c === '%' && n === '}')) {
          i += c === '-' ? 3 : 2;
          break;
        }
        i++;
      }
      continue;
    }

    i++;
  }
  return false;
}

/**
 * Returns true if `offset` is inside a string literal within a Jinja2 expression,
 * BUT NOT if that string is the first arg to lookup/query/q (those are 'lookup' context).
 */
export function isInsideString(fullText: string, offset: number): boolean {
  if (!isInsideDelimiters(fullText, offset)) return false;

  // Find the start of the current expression/statement block
  let exprStart = offset;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = fullText[i];
    const next = fullText[i + 1];
    if ((ch === '{' && next === '{') || (ch === '{' && next === '%')) {
      exprStart = i + 2;
      if (fullText[exprStart] === '-') exprStart++;
      break;
    }
  }

  const exprText = fullText.slice(exprStart, offset);

  // Check if inside a lookup/query/q string (those are NOT plain strings)
  if (
    /(?:lookup|query|q)\s*\(\s*["']$/.test(exprText) ||
    /(?:lookup|query|q)\s*\(\s*["'][^"']*$/.test(exprText)
  ) {
    // Could be lookup context — not a plain string
    return false;
  }

  // Scan through expression text to see if we're inside a string
  let inString = false;
  let quote = '';
  for (let i = 0; i < exprText.length; i++) {
    const ch = exprText[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (ch === quote) {
        inString = false;
        quote = '';
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true;
        quote = ch;
      }
    }
  }
  return inString;
}

// ---------------------------------------------------------------------------
// Text extraction helpers
// ---------------------------------------------------------------------------

/**
 * Get the expression text from the start of the current Jinja2 block up to `offset`.
 * Returns null if not inside a delimiter block.
 */
function getExpressionPrefix(fullText: string, offset: number): string | null {
  if (!isInsideDelimiters(fullText, offset)) return null;

  for (let i = offset - 1; i >= 0; i--) {
    const ch = fullText[i];
    const next = fullText[i + 1];
    if ((ch === '{' && next === '{') || (ch === '{' && next === '%')) {
      let start = i + 2;
      if (fullText[start] === '-') start++;
      return fullText.slice(start, offset);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main context detection
// ---------------------------------------------------------------------------

/**
 * Detect the Jinja2 completion context at the given cursor position.
 *
 * @param fullText   Complete document text
 * @param lineNumber 1-based line number (Monaco convention)
 * @param column     1-based column number (Monaco convention)
 */
export function detectContext(fullText: string, lineNumber: number, column: number): Jinja2Context {
  const none: Jinja2Context = {
    type: 'none',
    partialWord: '',
    range: { startColumn: column, endColumn: column },
  };

  const offset = toOffset(fullText, lineNumber, column);

  // Comment → none
  if (isInsideComment(fullText, offset)) return none;

  // Outside delimiters → none
  if (!isInsideDelimiters(fullText, offset)) return none;

  const exprPrefix = getExpressionPrefix(fullText, offset);
  if (exprPrefix === null) return none;

  // --- Lookup context ---
  // lookup/query/q followed by ( optional-spaces quote text-up-to-cursor
  const lookupMatch = exprPrefix.match(/(?:lookup|query|q)\s*\(\s*(["'])([^"']*)$/);
  if (lookupMatch) {
    const partial = lookupMatch[2];
    const startCol = column - partial.length;
    return {
      type: 'lookup',
      partialWord: partial,
      range: { startColumn: startCol, endColumn: column },
    };
  }

  // --- Not inside a plain string → check filter/test ---
  // Inside a non-lookup string → none
  if (isInsideString(fullText, offset)) return none;

  // --- {% filter ... %} block special case ---
  // When inside a {% %} block and the expression starts with 'filter ' (keyword)
  const trimmedExpr = exprPrefix.trimStart();
  if (trimmedExpr.match(/^filter\s+([\w.]*)$/)) {
    const m = trimmedExpr.match(/^filter\s+([\w.]*)$/);
    const partial = m ? m[1] : '';
    const startCol = column - partial.length;
    return {
      type: 'filter',
      partialWord: partial,
      range: { startColumn: startCol, endColumn: column },
    };
  }

  // --- Test context: after `is ` or `is not ` ---
  // Look for pattern after the last pipe (if any), or from the beginning
  // of expression. Must not be inside a string.
  const testMatch =
    exprPrefix.match(/\bis\s+not\s+([\w.]*)$/) ?? exprPrefix.match(/\bis\s+([\w.]*)$/);
  if (testMatch) {
    const partial = testMatch[1];
    const startCol = column - partial.length;
    return {
      type: 'test',
      partialWord: partial,
      range: { startColumn: startCol, endColumn: column },
    };
  }

  // --- Filter context: after `|` ---
  // Find the last `|` that is not inside a string, searching backwards in exprPrefix
  let lastPipePos = -1;
  {
    let inStr = false;
    let q = '';
    for (let i = 0; i < exprPrefix.length; i++) {
      const ch = exprPrefix[i];
      if (inStr) {
        if (ch === '\\') {
          i++;
          continue;
        }
        if (ch === q) {
          inStr = false;
          q = '';
        }
      } else {
        if (ch === '"' || ch === "'") {
          inStr = true;
          q = ch;
        } else if (ch === '|') {
          lastPipePos = i;
        }
      }
    }
  }

  if (lastPipePos >= 0) {
    const afterPipe = exprPrefix.slice(lastPipePos + 1);
    const wsMatch = afterPipe.match(/^(\s*)([\w.]*)$/);
    if (wsMatch) {
      const partial = wsMatch[2];
      const startCol = column - partial.length;
      return {
        type: 'filter',
        partialWord: partial,
        range: { startColumn: startCol, endColumn: column },
      };
    }
  }

  return none;
}

// ---------------------------------------------------------------------------
// Hover support: findFilterName
// ---------------------------------------------------------------------------

/**
 * Given a line text and a 1-based column, returns the filter/test name at that
 * position IF it appears after a `|` or after `is`/`is not`.
 *
 * Used for hover-over documentation lookup.
 */
export function findFilterName(lineText: string, column: number): string | null {
  // column is 1-based; convert to 0-based index
  const pos = column - 1;

  // Find the word boundaries at the cursor position
  let wordStart = pos;
  while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) wordStart--;
  let wordEnd = pos;
  while (wordEnd < lineText.length && /\w/.test(lineText[wordEnd])) wordEnd++;

  if (wordStart === wordEnd) return null;
  const word = lineText.slice(wordStart, wordEnd);

  // Look at text before the word
  const before = lineText.slice(0, wordStart);

  // After `|` (with optional whitespace)
  if (/\|\s*$/.test(before)) return word;

  // After `is not ` or `is `
  if (/\bis\s+not\s+$/.test(before) || /\bis\s+$/.test(before)) return word;

  // Inside first string arg of lookup()/query()/q()
  if (/(?:lookup|query|q)\s*\(\s*["']$/.test(before)) return word;

  return null;
}

// ---------------------------------------------------------------------------
// Signature help: findFilterCallContext
// ---------------------------------------------------------------------------

/**
 * Determines if the cursor is inside a filter/lookup call like `to_yaml(indent=4, `.
 *
 * Returns `{ filterName, activeParam }` where `activeParam` is 0-based (counts commas).
 * Returns `null` if the cursor is not inside a filter call.
 */
export function findFilterCallContext(
  fullText: string,
  lineNumber: number,
  column: number
): { filterName: string; activeParam: number } | null {
  const offset = toOffset(fullText, lineNumber, column);

  if (isInsideComment(fullText, offset)) return null;
  if (!isInsideDelimiters(fullText, offset)) return null;

  const exprPrefix = getExpressionPrefix(fullText, offset);
  if (exprPrefix === null) return null;

  // Find the matching open-paren: scan backwards, skipping nested parens and strings
  let depth = 0;
  let openParenPos = -1;
  for (let i = exprPrefix.length - 1; i >= 0; i--) {
    const ch = exprPrefix[i];
    if (ch === ')') {
      depth++;
    } else if (ch === '(') {
      if (depth === 0) {
        openParenPos = i;
        break;
      }
      depth--;
    } else if (ch === '"' || ch === "'") {
      // Scan backwards to find the opening quote
      const q = ch;
      i--;
      while (i >= 0 && exprPrefix[i] !== q) i--;
      // i is now at the opening quote
    }
  }

  if (openParenPos < 0) return null;

  // Find the filter name before the open paren
  const beforeParen = exprPrefix.slice(0, openParenPos);
  const nameMatch = beforeParen.match(/([a-zA-Z_]\w*)$/);
  if (!nameMatch) return null;
  const filterName = nameMatch[1];

  // Count commas at depth 0 between openParenPos+1 and end of exprPrefix
  const inside = exprPrefix.slice(openParenPos + 1);
  let activeParam = 0;
  let d = 0;
  let inStr = false;
  let q = '';
  for (let i = 0; i < inside.length; i++) {
    const ch = inside[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === q) {
        inStr = false;
        q = '';
      }
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      q = ch;
    } else if (ch === '(' || ch === '[') {
      d++;
    } else if (ch === ')' || ch === ']') {
      if (d === 0) break; // beyond our paren
      d--;
    } else if (ch === ',' && d === 0) {
      activeParam++;
    }
  }

  return { filterName, activeParam };
}
