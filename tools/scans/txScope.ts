/**
 * The transaction-scope scan (storage spec section 8.5; D15). IndexedDB commits a transaction as
 * soon as no request is pending at the end of a task, so any wait inside a transaction scope on
 * something that is not a database request (WebCrypto, a timer, a non-Dexie promise, a
 * confirmation, a persistence request) commits what has been done so far. In the import write or
 * an upgrade, that would make earlier clear() calls permanent with nothing added back. A try or a
 * .catch() that swallows a failed bulkAdd commits a partial write the same way.
 *
 * A scope is the function passed to `.transaction(...)` (its last argument), to `.upgrade(...)`
 * and to `.on('populate', ...)`, any function whose doc comment carries `@transactionScope`, and
 * every function nested in one. A scope passed by name is followed to its declaration in the same
 * file. Inside a scope this reports:
 * - an `async` function, an `await`, a `try` statement, a `.catch(` or `.finally(` call;
 * - a `.then(` whose receiver is not a call rooted at `db`, `tx` or `Dexie.Promise`;
 * - any reference to crypto, setTimeout, setInterval, queueMicrotask, fetch, navigator, window,
 *   confirm or requestPersistentStorage.
 * It runs on the phone app's source (apps/mobile-web/src, tests excluded) in `pnpm scan`.
 */
import ts from 'typescript';

export interface ScopeProblem {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule:
    'async' | 'await' | 'try' | 'catch' | 'finally' | 'then-receiver' | 'forbidden-name';
  readonly detail: string;
}

/** Names a scope may never refer to: none of them is a database request. */
export const FORBIDDEN_NAMES: readonly string[] = [
  'crypto',
  'setTimeout',
  'setInterval',
  'queueMicrotask',
  'fetch',
  'navigator',
  'window',
  'confirm',
  'requestPersistentStorage',
];

/** Roots a `.then(` receiver may start from. */
const DEXIE_ROOTS: readonly string[] = ['db', 'tx', 'Dexie.Promise'];

/** Doc-comment tag that marks a function, declared elsewhere, as a transaction scope. */
export const SCOPE_TAG = 'transactionScope';

type FunctionNode =
  ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | ts.MethodDeclaration;

const isFunctionNode = (node: ts.Node): node is FunctionNode =>
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node);

const hasScopeTag = (node: ts.Node): boolean =>
  ts.getJSDocTags(node).some((tag) => tag.tagName.text === SCOPE_TAG);

/** The names along a member chain from its root: `Dexie.Promise.all(x).then` gives Dexie, Promise, all, then. */
function chainNames(expression: ts.Expression): string[] | null {
  let node: ts.Expression = expression;
  const names: string[] = [];
  for (;;) {
    if (ts.isCallExpression(node)) node = node.expression;
    else if (ts.isPropertyAccessExpression(node)) {
      names.unshift(node.name.text);
      node = node.expression;
    } else if (ts.isElementAccessExpression(node) || ts.isNonNullExpression(node)) {
      node = node.expression;
    } else if (ts.isParenthesizedExpression(node)) node = node.expression;
    else if (ts.isIdentifier(node)) {
      names.unshift(node.text);
      return names;
    } else return null;
  }
}

/** Whether a `.then(` receiver is a call rooted at db, tx or Dexie.Promise. */
function isDexieReceiver(receiver: ts.Expression): boolean {
  let node = receiver;
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  if (!ts.isCallExpression(node)) return false;
  const names = chainNames(node);
  if (names === null || names.length === 0) return false;
  const root = names[0] === 'Dexie' && names[1] === 'Promise' ? 'Dexie.Promise' : (names[0] ?? '');
  return DEXIE_ROOTS.includes(root);
}

/** A forbidden name used as a value (not as a property name, except on globalThis, self or window). */
function forbiddenReference(node: ts.Identifier): boolean {
  if (!FORBIDDEN_NAMES.includes(node.text)) return false;
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    const owner = parent.expression;
    return ts.isIdentifier(owner) && ['globalThis', 'self', 'window'].includes(owner.text);
  }
  if (
    (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  return true;
}

/** Every transaction scope in a source file. */
export function findScopes(source: ts.SourceFile): FunctionNode[] {
  const declared = new Map<string, FunctionNode>();
  const scopes = new Set<FunctionNode>();
  const byName: ts.Identifier[] = [];

  const consider = (argument: ts.Expression | undefined): void => {
    if (argument === undefined) return;
    if (isFunctionNode(argument)) scopes.add(argument);
    else if (ts.isIdentifier(argument)) byName.push(argument);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      declared.set(node.name.text, node);
      if (hasScopeTag(node)) scopes.add(node);
    }
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer !== undefined &&
          isFunctionNode(d.initializer)
        ) {
          declared.set(d.name.text, d.initializer);
          if (hasScopeTag(node)) scopes.add(d.initializer);
        }
      }
    }
    if (ts.isPropertyAssignment(node) && isFunctionNode(node.initializer) && hasScopeTag(node)) {
      scopes.add(node.initializer);
    }
    if (ts.isMethodDeclaration(node) && hasScopeTag(node)) scopes.add(node);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const args = node.arguments;
      if (method === 'transaction') consider(args[args.length - 1]);
      if (method === 'upgrade') consider(args[0]);
      const first = args[0];
      if (
        method === 'on' &&
        first !== undefined &&
        ts.isStringLiteralLike(first) &&
        first.text === 'populate'
      ) {
        consider(args[1]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const name of byName) {
    const fn = declared.get(name.text);
    if (fn !== undefined) scopes.add(fn);
  }
  return [...scopes];
}

/** Problems inside the transaction scopes of one file. */
export function scanTransactionScopes(file: string, text: string): ScopeProblem[] {
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const problems: ScopeProblem[] = [];
  const seen = new Set<string>();
  const report = (node: ts.Node, rule: ScopeProblem['rule'], detail: string): void => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const key = `${String(line)}:${String(character)}:${rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ file, line: line + 1, column: character + 1, rule, detail });
  };
  const check = (node: ts.Node): void => {
    if (
      isFunctionNode(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      report(node, 'async', 'an async function in a transaction scope');
    }
    if (ts.isAwaitExpression(node)) report(node, 'await', 'an await in a transaction scope');
    if (ts.isTryStatement(node)) report(node, 'try', 'a try statement in a transaction scope');
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'catch') report(node, 'catch', '.catch() in a transaction scope');
      if (method === 'finally') report(node, 'finally', '.finally() in a transaction scope');
      if (method === 'then' && !isDexieReceiver(node.expression.expression)) {
        report(node, 'then-receiver', '.then() on something that is not a Dexie request');
      }
    }
    if (ts.isIdentifier(node) && forbiddenReference(node)) {
      report(node, 'forbidden-name', `${node.text} in a transaction scope`);
    }
    ts.forEachChild(node, check);
  };
  for (const scope of findScopes(source)) check(scope);
  return problems;
}

/** The files the scan covers: the phone app's source, tests excluded. */
export function isScannedForScopes(file: string): boolean {
  return /^apps\/mobile-web\/src\/.+\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file);
}
