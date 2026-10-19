import { describe, expect, it } from 'vitest';
import { decodeText, extractCodeText, normalise, visibleSegments } from './extract';
import { healthPhraseRules, stockAndCartRules } from './rules';
import { scanVisible } from './scan';

const texts = (file: string, code: string) => extractCodeText(file, code).map((s) => s.text);

describe('text a person would see, pulled from code', () => {
  it('takes string literals and template literals, writing substitutions as {}', () => {
    const code = "const a = 'Plain';\nconst b = `Lose ${kg} kg in ${n} weeks`;\nconst c = `none`;";
    expect(texts('a.ts', code)).toEqual(['Plain', 'Lose {} kg in {} weeks', 'none']);
  });

  it('folds a + chain into one string and does not report its parts again', () => {
    const code = "const t = 'You could cut down ' +\n  'by ' + count + (' drink' + `s a ${unit}`);";
    expect(texts('a.ts', code)).toEqual(['You could cut down by {} drinks a {}']);
  });

  it('leaves arithmetic alone', () => {
    expect(texts('a.ts', 'const n = a + b + 1;')).toEqual([]);
  });

  it('reads a JSX element as one text, nested inline elements included', () => {
    const code = [
      'export const P = () => (',
      '  <p className="note">',
      "    You could cut <b>down</b>{' '}",
      '    by {n} a <em>day</em>',
      '  </p>',
      ');',
    ].join('\n');
    expect(texts('a.tsx', code)).toEqual(['You could cut down by {} a day', 'note']);
  });

  it('reads JSX inside an expression as its own element', () => {
    const code = 'const P = () => <div>{show && <span>Inner text</span>} outer</div>;';
    expect(texts('a.tsx', code)).toEqual(['{} outer', 'Inner text']);
  });

  it('decodes HTML entities and drops invisible characters', () => {
    const code = 'const P = () => <p title="You&apos;re">Cut&nbsp;do\u200bwn &amp; up</p>;';
    expect(texts('a.tsx', code)).toEqual(['Cut\u00a0down & up', "You're"]);
  });

  it('skips comments', () => {
    const code = '// cut down by one\n/* stop drinking */\nconst x = 1; // in stock';
    expect(texts('a.ts', code)).toEqual([]);
  });

  it('reports a match at the start of the literal it came from', () => {
    const code = "const ok = 1;\nconst t =\n  'Please ' +\n  'stop drinking';\n";
    expect(
      scanVisible('apps/x/src/a.ts', code, healthPhraseRules).map((v) => [
        v.ruleId,
        v.line,
        v.column,
        v.excerpt,
      ]),
    ).toEqual([['taper-stop-drinking', 3, 3, 'Please stop drinking']]);
  });

  it('parses JavaScript and JSX files too', () => {
    expect(texts('a.jsx', 'const P = () => <p>Hello {name}</p>;')).toEqual(['Hello {}']);
    expect(texts('a.mjs', "export default 'x';")).toEqual(['x']);
  });
});

describe('markup and data files', () => {
  it('strips tags and Markdown emphasis, decodes entities, and keeps line numbers', () => {
    const md = '# Title\n\nYou could **cut** <i>down</i>&nbsp;by one.\n';
    expect(visibleSegments('README.md', md)[0]?.text).toBe(
      '# Title\n\nYou could cut  down \u00a0by one.\n',
    );
    expect(
      scanVisible('README.md', md, healthPhraseRules).map((v) => [v.ruleId, v.line, v.column]),
    ).toEqual([['taper-cut-down-by', 3, 13]]);
  });

  it('decodes entities in JSON and YAML but keeps angle brackets', () => {
    expect(visibleSegments('a.json', '{"a": "Out&#45;of&#45;stock <b>"}')[0]?.text).toBe(
      '{"a": "Out-of-stock <b>"}',
    );
    expect(scanVisible('a.yml', 'x: In&nbsp;stock', stockAndCartRules)).toHaveLength(1);
  });

  it('reads other files as written', () => {
    expect(visibleSegments('wrangler.toml', 'a = "&amp;"')[0]?.text).toBe('a = "&amp;"');
  });

  it('maps every output character back to the input', () => {
    const { text, offsets } = normalise('a&amp;<b>c</b>', {
      stripTags: true,
      stripMarkdown: false,
    });
    expect(text).toBe('a& c ');
    expect(offsets).toEqual([0, 1, 6, 9, 10]);
  });
});

describe('decoding file content', () => {
  const utf16 = (s: string, bigEndian: boolean) => {
    const le = Buffer.from(s, 'utf16le');
    if (bigEndian) le.swap16();
    return Buffer.concat([Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]), le]);
  };

  it('decodes UTF-16 with a byte-order mark instead of treating it as binary', () => {
    expect(decodeText(utf16('I weigh 1 kg', false))).toBe('I weigh 1 kg');
    expect(decodeText(utf16('I weigh 1 kg', true))).toBe('I weigh 1 kg');
  });

  it('treats other files with NUL bytes as binary and strips a UTF-8 byte-order mark', () => {
    expect(decodeText(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]))).toBeUndefined();
    expect(decodeText(Buffer.from('\ufeffhello', 'utf8'))).toBe('hello');
  });
});
