/**
 * The transaction-scope scan (storage spec section 8.5; D15). IndexedDB commits a transaction as
 * soon as no request is pending at the end of a task, so any wait inside a transaction scope on
 * something that is not a database request (WebCrypto, a timer, a non-Dexie promise, a
 * confirmation, a persistence request) commits what has been done so far. In the import write or
 * an upgrade, that would make earlier clear() calls permanent with nothing added back. A try or a
 * .catch() that swallows a failed bulkAdd commits a partial write the same way.
 *
 * A scope is the function passed to `.transaction(...)` (its last argument), to `.upgrade(...)`
 * and to `.on('populate', ...)`, any function whose doc comment carries `@transactionScope`, every
 * function nested in one, and every helper a scope calls or passes on: a function declared in the
 * same file, a function property of an object literal declared there, or (when the scan is given
 * the project's files) a function imported by name from a relative module, transitively. A scope
 * passed by name is followed to its declaration in the same file. Inside a scope this reports:
 * - an `async` function, an `await`, a `try` statement, a `.catch(` or `.finally(` call;
 * - a `.then(` whose receiver is not a call rooted at `db`, `tx` or `Dexie.Promise`;
 * - any reference to crypto, setTimeout, setInterval, queueMicrotask, fetch, navigator, window,
 *   confirm or requestPersistentStorage.
 * It runs on the phone app's source (apps/mobile-web/src, tests excluded) in `pnpm scan`. Helpers
 * reached only through a value chosen at run time (for example a store's rules picked from a map)
 * cannot be followed, so those functions carry `@transactionScope` themselves.
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

/** A function in a source file, by the name it is called by. */
interface Declared {
  /** Functions declared by name: function declarations and consts holding a function. */
  readonly functions: Map<string, FunctionNode>;
  /** Consts holding an object literal: their function-valued properties, by property name. */
  readonly objects: Map<string, Map<string, FunctionNode>>;
  /** Names imported by name from a relative module: the module specifier and the exported name. */
  readonly imports: Map<string, { readonly specifier: string; readonly name: string }>;
}

function declarationsOf(source: ts.SourceFile): Declared {
  const functions = new Map<string, FunctionNode>();
  const objects = new Map<string, Map<string, FunctionNode>>();
  const imports = new Map<string, { specifier: string; name: string }>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      functions.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      let init: ts.Expression = node.initializer;
      while (
        ts.isAsExpression(init) ||
        ts.isSatisfiesExpression(init) ||
        ts.isParenthesizedExpression(init)
      ) {
        init = init.expression;
      }
      if (isFunctionNode(init)) functions.set(node.name.text, init);
      if (ts.isObjectLiteralExpression(init)) {
        const members = new Map<string, FunctionNode>();
        for (const property of init.properties) {
          if (ts.isMethodDeclaration(property) && ts.isIdentifier(property.name)) {
            members.set(property.name.text, property);
          } else if (
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            isFunctionNode(property.initializer)
          ) {
            members.set(property.name.text, property.initializer);
          }
        }
        objects.set(node.name.text, members);
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith('.') &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        if (element.isTypeOnly) continue;
        imports.set(element.name.text, {
          specifier: node.moduleSpecifier.text,
          name: (element.propertyName ?? element.name).text,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { functions, objects, imports };
}

/** Every transaction scope a source file declares: the roots, before helpers are followed. */
export function findScopes(source: ts.SourceFile): FunctionNode[] {
  const declared = declarationsOf(source).functions;
  const scopes = new Set<FunctionNode>();
  const byName: ts.Identifier[] = [];

  const consider = (argument: ts.Expression | undefined): void => {
    if (argument === undefined) return;
    if (isFunctionNode(argument)) scopes.add(argument);
    else if (ts.isIdentifier(argument)) byName.push(argument);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && hasScopeTag(node)) {
      scopes.add(node);
    }
    if (ts.isVariableStatement(node) && hasScopeTag(node)) {
      for (const d of node.declarationList.declarations) {
        if (d.initializer !== undefined && isFunctionNode(d.initializer)) scopes.add(d.initializer);
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

/** A file the scan reads helpers from (another file of the same project). */
export interface ScannedFile {
  readonly file: string;
  readonly text: string;
}

/**
 * Finds a relative import's file (`.ts`, `.tsx` or `index.ts`), or null when it is not part of the
 * scanned project. scanTransactionScopes follows helpers into it only when given one.
 */
export type ModuleResolver = (fromFile: string, specifier: string) => ScannedFile | null;

interface Parsed {
  readonly file: string;
  readonly source: ts.SourceFile;
  readonly declared: Declared;
}

function parse(file: string, text: string): Parsed {
  const kind = /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return { file, source, declared: declarationsOf(source) };
}

/**
 * Problems inside the transaction scopes of one file. Every function a scope calls, or passes on
 * (`.then(helper)`), is checked as part of the scope too, transitively: a function declared in the
 * same file, a function property of an object literal declared there (`rules.check(...)`), and,
 * when `resolve` is given, a function imported by name from another file of the project. So an
 * await, a try, a timer or WebCrypto hidden in a helper is reported like one written in the scope
 * itself (data-loss and tests reviews).
 */
export function scanTransactionScopes(
  file: string,
  text: string,
  resolve: ModuleResolver | null = null,
): ScopeProblem[] {
  const root = parse(file, text);
  const parsedFiles = new Map<string, Parsed>([[file, root]]);
  const problems: ScopeProblem[] = [];
  const seen = new Set<string>();
  const report = (
    where: Parsed,
    node: ts.Node,
    rule: ScopeProblem['rule'],
    detail: string,
  ): void => {
    const { line, character } = where.source.getLineAndCharacterOfPosition(
      node.getStart(where.source),
    );
    const key = `${where.file}:${String(line)}:${String(character)}:${rule}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ file: where.file, line: line + 1, column: character + 1, rule, detail });
  };

  const queue: { readonly where: Parsed; readonly fn: FunctionNode }[] = findScopes(
    root.source,
  ).map((fn) => ({ where: root, fn }));
  const visited = new Set<FunctionNode>();

  const imported = (where: Parsed, name: string): { where: Parsed; fn: FunctionNode } | null => {
    const link = where.declared.imports.get(name);
    if (link === undefined || resolve === null) return null;
    const target = resolve(where.file, link.specifier);
    if (target === null) return null;
    let parsed = parsedFiles.get(target.file);
    if (parsed === undefined) {
      parsed = parse(target.file, target.text);
      parsedFiles.set(target.file, parsed);
    }
    const fn = parsed.declared.functions.get(link.name);
    return fn === undefined ? null : { where: parsed, fn };
  };

  /** The function an identifier or `object.property` in a scope refers to, if the scan can see it. */
  const helperOf = (
    where: Parsed,
    node: ts.Expression,
  ): { where: Parsed; fn: FunctionNode } | null => {
    if (ts.isIdentifier(node)) {
      const local = where.declared.functions.get(node.text);
      if (local !== undefined) return { where, fn: local };
      return imported(where, node.text);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const member = where.declared.objects.get(node.expression.text)?.get(node.name.text);
      if (member !== undefined) return { where, fn: member };
    }
    return null;
  };

  const check = (where: Parsed, node: ts.Node): void => {
    if (
      isFunctionNode(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      report(where, node, 'async', 'an async function in a transaction scope');
    }
    if (ts.isAwaitExpression(node)) report(where, node, 'await', 'an await in a transaction scope');
    if (ts.isTryStatement(node))
      report(where, node, 'try', 'a try statement in a transaction scope');
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (method === 'catch') report(where, node, 'catch', '.catch() in a transaction scope');
        if (method === 'finally')
          report(where, node, 'finally', '.finally() in a transaction scope');
        if (method === 'then' && !isDexieReceiver(node.expression.expression)) {
          report(where, node, 'then-receiver', '.then() on something that is not a Dexie request');
        }
      }
      // A helper called from the scope runs inside the transaction: check it as a scope too.
      const callee = helperOf(where, node.expression);
      if (callee !== null) queue.push(callee);
      // So does a helper passed on, as in `.then(helper)` or `Dexie.Promise.all(list.map(helper))`.
      for (const argument of node.arguments) {
        const passed = helperOf(where, argument);
        if (passed !== null) queue.push(passed);
      }
    }
    if (ts.isIdentifier(node) && forbiddenReference(node)) {
      report(where, node, 'forbidden-name', `${node.text} in a transaction scope`);
    }
    ts.forEachChild(node, (child) => {
      check(where, child);
    });
  };

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (visited.has(next.fn)) continue;
    visited.add(next.fn);
    check(next.where, next.fn);
  }
  return problems;
}

/** The files the scan covers: the phone app's source, tests excluded. */
export function isScannedForScopes(file: string): boolean {
  return /^apps\/mobile-web\/src\/.+\.tsx?$/.test(file) && !/\.(?:test|spec)\.tsx?$/.test(file);
}
