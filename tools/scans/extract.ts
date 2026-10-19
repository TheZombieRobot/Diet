import ts from 'typescript';

/**
 * Text a person could see, pulled out of a file so the health and commerce phrase rules read the
 * words rather than the code around them (checklist item 3; HS-07, HS-08, HS-16, HS-19, HS-21).
 *
 * - Code (.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts): string literals, template literals with each
 *   substitution written as `{}`, `+` chains folded into one string, and the whole text of each
 *   JSX element including nested inline elements. Comments are skipped.
 * - Markup (.html/.svg/.md/.mdx): tags (and Markdown emphasis marks) removed, entities decoded.
 * - Data and styles (.json/.css/.yml/.yaml): entities decoded.
 * - Anything else: the raw text.
 */
export interface TextSegment {
  text: string;
  /** Offset in the original file for an index in `text`. */
  offsetAt: (index: number) => number;
  /** Shown in reports instead of the source line (the extracted text, not the code around it). */
  excerpt?: string;
}

/** The placeholder written for every interpolated or computed value. */
export const PLACEHOLDER = '{}';

const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const MARKUP_FILE = /\.(?:html?|svg|mdx?)$/i;
const MARKDOWN_FILE = /\.mdx?$/i;
const DATA_FILE = /\.(?:json|css|ya?ml)$/i;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  minus: '\u2212',
  hellip: '\u2026',
  shy: '',
  zwj: '',
  zwnj: '',
  dollar: '$',
  percnt: '%',
  cent: '\u00a2',
  pound: '\u00a3',
  euro: '\u20ac',
  num: '#',
  colon: ':',
  comma: ',',
  period: '.',
  excl: '!',
  quest: '?',
  sol: '/',
  lpar: '(',
  rpar: ')',
  times: '\u00d7',
  middot: '\u00b7',
  bull: '\u2022',
  deg: '\u00b0',
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/y;
const TAG = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/y;
/** Soft hyphen and zero-width characters, which can hide a phrase without changing how it looks. */
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/;

function decodeEntity(match: RegExpExecArray): string | undefined {
  const [, dec, hex, name] = match;
  const code = dec !== undefined ? Number(dec) : hex !== undefined ? parseInt(hex, 16) : undefined;
  if (code !== undefined) return code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
  return name === undefined ? undefined : NAMED_ENTITIES[name];
}

interface NormaliseOptions {
  stripTags: boolean;
  stripMarkdown: boolean;
}

/**
 * Decodes entities and drops invisible characters (and, for markup, tags), keeping a map from
 * each output character back to its offset in the input so reports point at the right line.
 */
export function normalise(
  text: string,
  { stripTags, stripMarkdown }: NormaliseOptions,
): { text: string; offsets: number[] } {
  let out = '';
  const offsets: number[] = [];
  const emit = (s: string, at: number) => {
    out += s;
    for (let k = 0; k < s.length; k++) offsets.push(at);
  };
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (stripTags && ch === '<') {
      TAG.lastIndex = i;
      const tag = TAG.exec(text);
      if (tag) {
        emit(' ', i);
        i += tag[0].length;
        continue;
      }
    }
    if (ch === '&') {
      ENTITY.lastIndex = i;
      const entity = ENTITY.exec(text);
      const decoded = entity ? decodeEntity(entity) : undefined;
      if (entity && decoded !== undefined) {
        emit(decoded.replace(INVISIBLE, ''), i);
        i += entity[0].length;
        continue;
      }
    }
    if (INVISIBLE.test(ch) || (stripMarkdown && (ch === '*' || ch === '`' || ch === '~'))) {
      i++;
      continue;
    }
    emit(ch, i);
    i++;
  }
  return { text: out, offsets };
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Decodes entities and drops invisible characters in text pulled from code. */
const clean = (s: string) => normalise(s, { stripTags: false, stripMarkdown: false }).text;

function scriptKind(file: string): ts.ScriptKind {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

const isPlus = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

const isStringLike = (
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateExpression(node);

function stringText(
  node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
): string {
  if (!ts.isTemplateExpression(node)) return node.text;
  return node.head.text + node.templateSpans.map((s) => PLACEHOLDER + s.literal.text).join('');
}

/** User-visible text in TypeScript or JavaScript source, one segment per literal or element. */
export function extractCodeText(file: string, text: string): TextSegment[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const consumed = new Set<ts.Node>();
  const segments: TextSegment[] = [];

  const emit = (node: ts.Node, value: string) => {
    const cleaned = clean(value);
    if (!cleaned.trim()) return;
    const start = node.getStart(source);
    segments.push({ text: cleaned, offsetAt: () => start, excerpt: collapse(cleaned) });
  };

  // `a + b + c` with at least one string operand becomes one string; other operands are `{}`.
  const foldPlus = (node: ts.BinaryExpression): string | undefined => {
    const operands: ts.Expression[] = [];
    const chain: ts.Node[] = [];
    const flatten = (n: ts.Expression) => {
      if (isPlus(n)) {
        chain.push(n);
        flatten(n.left);
        flatten(n.right);
      } else if (ts.isParenthesizedExpression(n) && isPlus(n.expression)) {
        chain.push(n);
        flatten(n.expression);
      } else operands.push(n);
    };
    flatten(node);
    if (!operands.some(isStringLike)) return undefined;
    for (const n of chain) consumed.add(n);
    return operands
      .map((o) => {
        if (!isStringLike(o)) return PLACEHOLDER;
        consumed.add(o);
        return stringText(o);
      })
      .join('');
  };

  // The whole text of an element, nested inline elements included, so `cut <b>down</b> by` reads
  // as one phrase. Expressions become `{}`, except plain strings such as {' '}.
  const jsxText = (children: ts.NodeArray<ts.JsxChild>): string =>
    children
      .map((child) => {
        if (ts.isJsxText(child)) return child.text;
        if (ts.isJsxExpression(child)) {
          const e = child.expression;
          if (!e) return '';
          if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
            consumed.add(e);
            return e.text;
          }
          return PLACEHOLDER;
        }
        if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
          return ` ${jsxText(child.children)} `;
        }
        return ' ';
      })
      .join('');

  const isJsxChild = (node: ts.Node) =>
    ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);

  const visit = (node: ts.Node) => {
    if (!consumed.has(node)) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        emit(node, node.text);
      } else if (ts.isTemplateExpression(node)) {
        emit(node, stringText(node));
      } else if (isPlus(node)) {
        const folded = foldPlus(node);
        if (folded !== undefined) emit(node, folded);
      } else if ((ts.isJsxElement(node) || ts.isJsxFragment(node)) && !isJsxChild(node)) {
        emit(node, collapse(jsxText(node.children)));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return segments;
}

/** The whole file as one segment, unchanged. */
export function rawSegment(text: string): TextSegment {
  return { text, offsetAt: (index) => index };
}

/** What a person would read in this file, for the health and commerce phrase rules. */
export function visibleSegments(file: string, text: string): TextSegment[] {
  if (CODE_FILE.test(file)) return extractCodeText(file, text);
  const markup = MARKUP_FILE.test(file);
  if (!markup && !DATA_FILE.test(file)) return [rawSegment(text)];
  const { text: normalised, offsets } = normalise(text, {
    stripTags: markup,
    stripMarkdown: MARKDOWN_FILE.test(file),
  });
  return [{ text: normalised, offsetAt: (index) => offsets[index] ?? text.length }];
}

/**
 * File content as text, or undefined for binary files. UTF-16 files (with a byte-order mark)
 * are decoded first, so a spreadsheet exported as "Unicode text" is still scanned.
 */
export function decodeText(bytes: Uint8Array): string | undefined {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2, buf.length - (buf.length % 2)));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buf.subarray(0, 8000).includes(0)) return undefined;
  const text = buf.toString('utf8');
  return text.startsWith('\ufeff') ? text.slice(1) : text;
}
