/**
 * Jinja2 Monarch tokenizer for Monaco Editor.
 *
 * Handles:
 *   {{ ... }}  — expression delimiters
 *   {% ... %}  — statement delimiters
 *   {# ... #}  — comments
 *   keywords, operators, filters, strings, numbers, identifiers, plain text
 */

import type * as Monaco from 'monaco-editor';

export function registerJinja2Language(monaco: typeof Monaco): void {
  monaco.languages.register({ id: 'jinja2' });

  monaco.languages.setMonarchTokensProvider('jinja2', {
    defaultToken: '',
    tokenPostfix: '.jinja2',

    keywords: [
      'for',
      'endfor',
      'if',
      'elif',
      'else',
      'endif',
      'block',
      'endblock',
      'extends',
      'include',
      'import',
      'from',
      'macro',
      'endmacro',
      'call',
      'endcall',
      'filter',
      'endfilter',
      'set',
      'raw',
      'endraw',
      'with',
      'endwith',
      'autoescape',
      'endautoescape',
      'do',
      'trans',
      'endtrans',
      'pluralize',
      'debug',
    ],

    operators: ['and', 'or', 'not', 'in', 'is'],

    filters: [
      'abs',
      'attr',
      'batch',
      'capitalize',
      'center',
      'count',
      'default',
      'd',
      'dictsort',
      'escape',
      'e',
      'filesizeformat',
      'first',
      'float',
      'forceescape',
      'format',
      'groupby',
      'indent',
      'int',
      'items',
      'join',
      'last',
      'length',
      'list',
      'lower',
      'map',
      'max',
      'min',
      'pprint',
      'random',
      'reject',
      'rejectattr',
      'replace',
      'reverse',
      'round',
      'safe',
      'select',
      'selectattr',
      'slice',
      'sort',
      'string',
      'striptags',
      'sum',
      'title',
      'tojson',
      'trim',
      'truncate',
      'unique',
      'upper',
      'urlencode',
      'urlize',
      'wordcount',
      'wordwrap',
      'xmlattr',
    ],

    tokenizer: {
      root: [
        // Jinja2 comments: {# ... #}
        [/{#/, 'comment', '@comment'],

        // Jinja2 statements: {% ... %} (with optional whitespace control)
        [/{%-?/, 'delimiter.statement.jinja2', '@statement'],

        // Jinja2 expressions: {{ ... }} (with optional whitespace control)
        [/{{-?/, 'delimiter.expression.jinja2', '@expression'],

        // Everything else is plain text / HTML
        [/./, ''],
      ],

      comment: [
        [/#}/, 'comment', '@pop'],
        [/[^#}]+/, 'comment'],
        [/[#}]/, 'comment'],
      ],

      statement: [
        [/-?%}/, 'delimiter.statement.jinja2', '@pop'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@operators': 'keyword.operator',
              '@filters': 'type',
              '@default': 'identifier',
            },
          },
        ],
        { include: '@commonExpression' },
      ],

      expression: [
        [/-?}}/, 'delimiter.expression.jinja2', '@pop'],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@operators': 'keyword.operator',
              '@filters': 'type',
              '@default': 'variable',
            },
          },
        ],
        { include: '@commonExpression' },
      ],

      commonExpression: [
        // Pipe operator
        [/\|/, 'delimiter.pipe.jinja2'],

        // Double-quoted strings
        [/"[^"]*"/, 'string'],

        // Single-quoted strings
        [/'[^']*'/, 'string'],

        // Numbers (int and float)
        [/\d+(\.\d+)?/, 'number'],

        // Comparison / arithmetic operators
        [/[=!<>]=?/, 'operator'],
        [/[+\-*/~]/, 'operator'],

        // Whitespace
        [/[^\S\n]+/, ''],
      ],
    },
  });
}
