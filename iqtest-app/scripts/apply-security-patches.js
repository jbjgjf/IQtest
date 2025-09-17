const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function patchNthCheck() {
  const parsePath = path.join(
    projectRoot,
    'node_modules',
    'svgo',
    'node_modules',
    'nth-check',
    'parse.js'
  );

  if (!fs.existsSync(parsePath)) {
    return;
  }

  const patchedSource = `'use strict';

module.exports = parse;

var whitespace = new Set([9, 10, 12, 13, 32]);
var ZERO = '0'.charCodeAt(0);
var NINE = '9'.charCodeAt(0);

function parse(formula) {
  formula = formula.trim().toLowerCase();

  if (formula === 'even') {
    return [2, 0];
  }

  if (formula === 'odd') {
    return [2, 1];
  }

  var idx = 0;
  var a = 0;
  var sign = readSign();
  var number = readNumber();

  if (idx < formula.length && formula.charAt(idx) === 'n') {
    idx += 1;
    a = sign * (number !== null ? number : 1);
    skipWhitespace();

    if (idx < formula.length) {
      sign = readSign();
      skipWhitespace();
      number = readNumber();
    } else {
      sign = 0;
      number = 0;
    }
  }

  if (number === null || idx < formula.length) {
    throw new SyntaxError("n-th rule couldn't be parsed ('" + formula + "')");
  }

  return [a, sign * number];

  function readSign() {
    var char = formula.charAt(idx);

    if (char === '-') {
      idx += 1;
      return -1;
    }

    if (char === '+') {
      idx += 1;
    }

    return 1;
  }

  function readNumber() {
    var start = idx;
    var value = 0;

    while (
      idx < formula.length &&
      formula.charCodeAt(idx) >= ZERO &&
      formula.charCodeAt(idx) <= NINE
    ) {
      value = value * 10 + (formula.charCodeAt(idx) - ZERO);
      idx += 1;
    }

    return idx === start ? null : value;
  }

  function skipWhitespace() {
    while (idx < formula.length && whitespace.has(formula.charCodeAt(idx))) {
      idx += 1;
    }
  }
}
`;

  fs.writeFileSync(parsePath, patchedSource, 'utf8');
}

function patchPostcss() {
  const tokenizePath = path.join(
    projectRoot,
    'node_modules',
    'resolve-url-loader',
    'node_modules',
    'postcss',
    'lib',
    'tokenize.js'
  );

  if (!fs.existsSync(tokenizePath)) {
    return;
  }

  let content = fs.readFileSync(tokenizePath, 'utf8');

  const replacements = [
    {
      pattern: /var RE_AT_END = .*;/,
      replacement: "var RE_AT_END = /[\\t\\n\\f\\r \"#'()/;[\\\\\\]{}]/g;"
    },
    {
      pattern: /var RE_WORD_END = .*;/,
      replacement: "var RE_WORD_END = /[\\t\\n\\f\\r !\"#'():;@[\\\\\\]{}]|\\\\/(?=\\\\*)/g;"
    },
    {
      pattern: /var RE_BAD_BRACKET = .*;/,
      replacement: "var RE_BAD_BRACKET = /.[\\r\\n\"'(/\\]/;"
    },
    {
      pattern: /var RE_HEX_ESCAPE = .*;/,
      replacement: "var RE_HEX_ESCAPE = /[\\\da-f]/i;"
    }
  ];

  let modified = false;

  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(tokenizePath, content, 'utf8');
  }
}

patchNthCheck();
patchPostcss();
