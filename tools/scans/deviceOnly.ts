/**
 * The device-only stores scan (checklist item 19; HEALTH_SAFETY section 7; HS-15, C49, GD-02, G8),
 * read with the TypeScript compiler and its type checker. The review of item 19 passed the earlier
 * regular expressions with an alias (`const database = storage.db; database.tables`), a template
 * or a `+` as a store name, an escape (`garden\u005fphotos`) and Dexie's own internals; none of
 * those changes what the compiler sees. Outside the files named in DEVICE_ONLY_ALLOWED_FILES
 * (tests aside) it reports:
 * - device-only-store-name: an identifier (escapes decoded) or a constant string (literals,
 *   templates and `+` folded, constants followed) naming the photo store, its repository or its
 *   record type;
 * - generic-store-access: a `.table(` or `.objectStore(` call whose first argument is not one
 *   plain string literal, and any other use of either method; a member that reaches every store
 *   (`tables`, `_allTables`, `core`, `idbdb`, `backendDB()`, `objectStoreNames`, ...) on a database
 *   object or on a value of unknown type; a computed member of a database object; a database
 *   object passed, cast or assigned where its type is lost (`as any`, `Object.values(db)`, a
 *   parameter typed `unknown` or a type parameter of the project's own), so the checks above keep
 *   seeing it; and the lists of every store's name;
 * - database-opened: `IDBFactory.open` or a new Dexie database.
 * A database object is a value whose type is, extends or includes Dexie, DietDb, Transaction,
 * DBCore, DBCoreTransaction, IDBFactory, IDBDatabase, IDBTransaction or the repositories (Repos),
 * whatever the variable is called. What it does not prove: that the allowed files are correct (the
 * exporters among them are tested at run time, backup.test.ts B3 and e2e/garden.spec.ts E1).
 *
 * Also here: test-only-import, read without types. No file outside the tests and the named test
 * helpers imports `@diet/test-fixtures`, a file of packages/test-fixtures or a test helper, so
 * test data (which this scan reads too) never reaches the app.
 */
import { posix } from 'node:path';
import ts from 'typescript';

export type DeviceOnlyRuleId =
  'device-only-store-name' | 'generic-store-access' | 'database-opened' | 'test-only-import';

export interface DeviceOnlyProblem {
  /** Repository-relative, forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly rule: DeviceOnlyRuleId;
  readonly detail: string;
}

/** The photo store in code: the store, its repository and its record type. */
export const PHOTO_STORE_NAME = /\bgarden_photos\b|\bgardenPhotos\b|\bGardenPhotoRecord\b/;

/**
 * Names that list every store, device-only stores included (exports of core and the database).
 * The specs of every store (TABLES, TABLES_V1, TABLES_BY_VERSION) are not here: validation, the
 * backup code and the transfer payload read them by a store's name, and every way from a name to
 * the database is checked above in those files, which naming them as allowed would exempt.
 */
export const STORE_LIST_NAME =
  /^(?:STORE_NAMES|STORES_V\d+|DEVICE_ONLY_TABLES\w*|storeNamesByVersion|expectedStoreNames)$/;

/** Types whose values reach the database, by declared name (bases and unions are followed). */
export const DATABASE_TYPES: ReadonlySet<string> = new Set([
  'Dexie',
  'DietDb',
  'Transaction',
  'DBCore',
  'DBCoreTransaction',
  'IDBFactory',
  'IDBDatabase',
  'IDBTransaction',
  'Repos',
]);

/** Members that reach every store, reported on a database object or a value of unknown type. */
export const EVERY_STORE_MEMBERS: ReadonlySet<string> = new Set([
  'tables',
  '_allTables',
  '_dbSchema',
  '_storeNames',
  '_novip',
  '_middlewares',
  'core',
  'idbdb',
  'idbtrans',
  'backendDB',
  'objectStoreNames',
]);

/** Members that reach every store too, but are common words: reported on a database object only. */
export const DATABASE_ONLY_MEMBERS: ReadonlySet<string> = new Set(['storeNames', 'schema', 'use']);

/** The methods that take a store's name. */
const STORE_METHODS: ReadonlySet<string> = new Set(['table', 'objectStore']);

/** The browser and the dependencies, as the app sees them; the scan never emits or reports types. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowJs: true,
  checkJs: false,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
};

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

/**
 * Parsed declaration files of the libraries and the dependencies, kept between programs: the
 * seeded tests build one program per throwaway repository, and the lib files never change.
 */
const libraryFiles = new Map<string, ts.SourceFile>();

function compilerHost(): ts.CompilerHost {
  const host = ts.createCompilerHost(COMPILER_OPTIONS, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    if (!fileName.includes('/node_modules/')) {
      return read(fileName, languageVersion, onError, shouldCreate);
    }
    const format = typeof languageVersion === 'object' ? languageVersion.impliedNodeFormat : '';
    const key = `${fileName}|${String(format)}`;
    const cached = libraryFiles.get(key);
    if (cached !== undefined) return cached;
    const parsed = read(fileName, languageVersion, onError, shouldCreate);
    if (parsed !== undefined) libraryFiles.set(key, parsed);
    return parsed;
  };
  return host;
}

/** The innermost expression under parentheses, assertions and `!`. */
function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** Whether a value of this type could be the photo store's name. */
function admitsPhotoStore(checker: ts.TypeChecker, type: ts.Type): boolean {
  const target =
    (type.flags & ts.TypeFlags.TypeParameter) !== 0 ? checker.getBaseConstraintOfType(type) : type;
  if (target === undefined || (target.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    return true;
  }
  return checker.isTypeAssignableTo(checker.getStringLiteralType('garden_photos'), target);
}

/**
 * A parameter typed with store names (a union holding the photo store's name, or a type parameter
 * constrained to one), as in `crudRepo(ctx, table)`; a plain `string` is not one.
 */
function takesStoreName(checker: ts.TypeChecker, type: ts.Type): boolean {
  const target =
    (type.flags & ts.TypeFlags.TypeParameter) !== 0 ? checker.getBaseConstraintOfType(type) : type;
  if (target === undefined || (target.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
    return false;
  }
  return (
    checker.isTypeAssignableTo(checker.getStringLiteralType('garden_photos'), target) &&
    !checker.isTypeAssignableTo(checker.getStringType(), target)
  );
}

/** Functions the allowed files export with a store-name parameter (store accessors). */
function storeAccessors(sources: readonly ts.SourceFile[], checker: ts.TypeChecker): Set<string> {
  const names = new Set<string>();
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const consider = (name: string, fn: ts.SignatureDeclarationBase) => {
    for (const parameter of fn.parameters) {
      const type = parameter.type && checker.getTypeFromTypeNode(parameter.type);
      if (type !== undefined && takesStoreName(checker, type)) names.add(name);
    }
  };
  for (const source of sources) {
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && exported(statement)) {
        consider(statement.name.text, statement);
      }
      if (ts.isVariableStatement(statement) && exported(statement)) {
        for (const d of statement.declarationList.declarations) {
          const init = d.initializer && unwrap(d.initializer);
          if (
            ts.isIdentifier(d.name) &&
            init &&
            (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
          ) {
            consider(d.name.text, init);
          }
        }
      }
    }
  }
  return names;
}

class FileScan {
  readonly problems: DeviceOnlyProblem[] = [];
  private readonly seen = new Set<string>();
  /** Local names of imported store accessors (`import { crudRepo as make }`). */
  private readonly aliases = new Set<string>();

  constructor(
    private readonly file: string,
    private readonly source: ts.SourceFile,
    private readonly checker: ts.TypeChecker,
    private readonly projectRoot: string,
    private readonly accessors: ReadonlySet<string>,
    private readonly allowedFiles: ReadonlySet<string>,
  ) {}

  run(): DeviceOnlyProblem[] {
    this.visit(this.source);
    return this.problems;
  }

  private report(node: ts.Node, rule: DeviceOnlyRuleId, detail: string): void {
    const { line, character } = this.source.getLineAndCharacterOfPosition(
      node.getStart(this.source),
    );
    const key = `${String(line)}:${String(character)}:${rule}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.problems.push({ file: this.file, line: line + 1, column: character + 1, rule, detail });
  }

  private typeOf(node: ts.Node): ts.Type {
    return this.checker.getTypeAtLocation(node);
  }

  private isDatabase(type: ts.Type, seen = new Set<ts.Type>()): boolean {
    if (seen.has(type)) return false;
    seen.add(type);
    if (type.isUnionOrIntersection()) return type.types.some((t) => this.isDatabase(t, seen));
    for (const symbol of [type.getSymbol(), type.aliasSymbol]) {
      if (symbol !== undefined && DATABASE_TYPES.has(symbol.getName())) return true;
    }
    const reference =
      (type.flags & ts.TypeFlags.Object) !== 0 &&
      ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0;
    const target = reference ? (type as ts.TypeReference).target : type;
    if (target.isClassOrInterface()) {
      for (const base of this.checker.getBaseTypes(target)) {
        if (this.isDatabase(base, seen)) return true;
      }
    }
    return false;
  }

  private static isUnknownType(type: ts.Type): boolean {
    return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
  }

  /** A string the expression always has: literals, templates and `+` folded, constants followed. */
  private constantString(node: ts.Expression, depth = 0): string | null {
    if (depth > 12) return null;
    const inner = unwrap(node);
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
    if (ts.isNumericLiteral(inner)) return String(Number(inner.text));
    if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = this.constantString(inner.left, depth + 1);
      const right = left === null ? null : this.constantString(inner.right, depth + 1);
      return left === null || right === null ? null : left + right;
    }
    if (ts.isTemplateExpression(inner)) {
      let text = inner.head.text;
      for (const span of inner.templateSpans) {
        const value = this.constantString(span.expression, depth + 1);
        if (value === null) return null;
        text += value + span.literal.text;
      }
      return text;
    }
    const type = this.typeOf(inner);
    if (type.isStringLiteral()) return type.value;
    if (type.isNumberLiteral()) return String(type.value);
    return null;
  }

  /** Whether a member of this name needs a look at its receiver's type. */
  private static isWatchedMember(name: string): boolean {
    return (
      STORE_METHODS.has(name) ||
      EVERY_STORE_MEMBERS.has(name) ||
      DATABASE_ONLY_MEMBERS.has(name) ||
      name === 'open'
    );
  }

  /** `receiver` is read only when the name calls for it, as reading types costs the most. */
  private checkMember(
    node: ts.Node,
    name: string,
    receiver: () => ts.Type,
    callee: ts.CallExpression | null,
  ): void {
    if (!FileScan.isWatchedMember(name)) return;
    if (STORE_METHODS.has(name) && callee !== null) {
      // Whatever the receiver: Dexie's table() and IndexedDB's objectStore() take any string.
      const first = callee.arguments[0];
      if (first === undefined || !ts.isStringLiteral(first)) {
        this.report(node, 'generic-store-access', `.${name}() with a name that is not one literal`);
      }
      return;
    }
    const type = receiver();
    const database = this.isDatabase(type);
    const unknown = FileScan.isUnknownType(type);
    if (STORE_METHODS.has(name) && (database || unknown)) {
      this.report(node, 'generic-store-access', `.${name} used other than as a call`);
    }
    if (EVERY_STORE_MEMBERS.has(name) && (database || unknown)) {
      this.report(node, 'generic-store-access', `.${name} reaches every store`);
    }
    if (DATABASE_ONLY_MEMBERS.has(name) && database) {
      this.report(node, 'generic-store-access', `.${name} on a database object`);
    }
    if (name === 'open' && this.hasType(type, 'IDBFactory')) {
      this.report(node, 'database-opened', 'IDBFactory.open');
    }
  }

  private hasType(type: ts.Type, name: string): boolean {
    if (type.isUnionOrIntersection()) return type.types.some((t) => this.hasType(t, name));
    return type.getSymbol()?.getName() === name;
  }

  /**
   * A store accessor of the allowed files (`crudRepo(ctx, table)`): called with a name that could
   * be the photo store's and is not one literal, it reaches stores generically. Used other than
   * in a call (kept, passed on or exported again under another name), it is reported as well.
   */
  private checkAccessor(node: ts.Identifier): void {
    const parent = node.parent;
    if (ts.isImportSpecifier(parent)) {
      if ((parent.propertyName ?? parent.name) === node) this.aliases.add(parent.name.text);
      return;
    }
    if (ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return;
    const holder = ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : node;
    const call = holder.parent;
    if (ts.isCallExpression(call) && call.expression === holder) {
      call.arguments.forEach((arg, index) => {
        if (ts.isStringLiteral(arg)) return;
        const parameter = this.declaredParameterType(call, index);
        if (parameter === undefined || !takesStoreName(this.checker, parameter)) return;
        if (admitsPhotoStore(this.checker, this.typeOf(arg))) {
          this.report(arg, 'generic-store-access', 'a store name that is not one literal');
        }
      });
      return;
    }
    let symbol = this.checker.getSymbolAtLocation(node);
    if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      symbol = this.checker.getAliasedSymbol(symbol);
    }
    const declared = symbol?.declarations?.[0]?.getSourceFile().fileName;
    if (declared !== undefined && this.allowedFiles.has(declared)) {
      this.report(node, 'generic-store-access', `the store accessor ${node.text} passed on`);
    }
  }

  /** A generic function of the project's own: a database object passed to it loses its type. */
  private isProjectTypeParameter(type: ts.Type): boolean {
    if ((type.flags & ts.TypeFlags.TypeParameter) === 0) return false;
    const constraint = this.checker.getBaseConstraintOfType(type);
    if (constraint !== undefined && this.isDatabase(constraint)) return false;
    const declaration = type.getSymbol()?.declarations?.[0];
    const file = declaration?.getSourceFile().fileName ?? '';
    return file.startsWith(this.projectRoot) && !file.includes('/node_modules/');
  }

  /** Whether a database object in this place keeps its type. */
  private checkKeepsType(node: ts.Expression): void {
    const parent = node.parent;
    let target: ts.Type | undefined;
    if (
      (ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isSatisfiesExpression(parent)) &&
      parent.expression === node
    ) {
      target = this.checker.getTypeFromTypeNode(parent.type);
    } else if (
      (ts.isForInStatement(parent) && parent.expression === node) ||
      ts.isSpreadAssignment(parent) ||
      ts.isJsxSpreadAttribute(parent) ||
      ts.isSpreadElement(parent)
    ) {
      this.report(node, 'generic-store-access', 'a database object spread or listed by key');
      return;
    } else {
      target = this.checker.getContextualType(node);
      if (target === undefined) return;
      if (
        (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        parent.arguments?.includes(node) === true
      ) {
        const declared = this.declaredParameterType(parent, parent.arguments.indexOf(node));
        if (declared !== undefined && this.isProjectTypeParameter(declared)) {
          this.report(node, 'generic-store-access', 'a database object passed to a generic');
          return;
        }
      }
      if ((target.flags & ts.TypeFlags.TypeParameter) !== 0) return;
    }
    if (!this.isDatabase(target)) {
      this.report(node, 'generic-store-access', 'a database object where its type is lost');
    }
  }

  /** The declared (uninstantiated) type of a call's parameter at an argument's index. */
  private declaredParameterType(
    call: ts.CallExpression | ts.NewExpression,
    index: number,
  ): ts.Type | undefined {
    const declaration = this.checker.getResolvedSignature(call)?.getDeclaration();
    if (declaration === undefined || !('parameters' in declaration)) return undefined;
    const parameters = declaration.parameters;
    const parameter = parameters[Math.min(index, parameters.length - 1)];
    if (parameter?.type === undefined) return undefined;
    return this.checker.getTypeFromTypeNode(parameter.type);
  }

  /** Expression kinds that can hold a database object (literals, functions and sums cannot). */
  private static canBeDatabase(node: ts.Node): boolean {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
      case ts.SyntaxKind.ThisKeyword:
      case ts.SyntaxKind.PropertyAccessExpression:
      case ts.SyntaxKind.ElementAccessExpression:
      case ts.SyntaxKind.CallExpression:
      case ts.SyntaxKind.NewExpression:
      case ts.SyntaxKind.AwaitExpression:
      case ts.SyntaxKind.ConditionalExpression:
      case ts.SyntaxKind.ParenthesizedExpression:
      case ts.SyntaxKind.NonNullExpression:
        return true;
      case ts.SyntaxKind.BinaryExpression: {
        const operator = (node as ts.BinaryExpression).operatorToken.kind;
        return (
          operator === ts.SyntaxKind.QuestionQuestionToken ||
          operator === ts.SyntaxKind.BarBarToken ||
          operator === ts.SyntaxKind.AmpersandAmpersandToken ||
          operator === ts.SyntaxKind.CommaToken
        );
      }
      default:
        return false;
    }
  }

  /**
   * Expressions in a place with a target type: arguments, assertions, typed initializers, returns,
   * object and array members, spreads and `for…in`. An untyped initializer keeps the value's own
   * type, so the checks on members still see it.
   */
  private static isValueUse(node: ts.Node): node is ts.Expression {
    // Kinds first: the source file itself has no parent.
    if (!FileScan.canBeDatabase(node)) return false;
    const parent = node.parent;
    if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
      return parent.arguments?.includes(node as ts.Expression) === true;
    }
    if (
      ts.isAsExpression(parent) ||
      ts.isTypeAssertionExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isSpreadAssignment(parent) ||
      ts.isSpreadElement(parent) ||
      ts.isJsxSpreadAttribute(parent) ||
      ts.isReturnStatement(parent) ||
      ts.isArrayLiteralExpression(parent)
    ) {
      return true;
    }
    // A prop; an expression among the children is rendered, which reads no store.
    if (ts.isJsxExpression(parent)) return ts.isJsxAttribute(parent.parent);
    if (ts.isForInStatement(parent)) return parent.expression === node;
    if (
      ts.isVariableDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isParameter(parent)
    ) {
      return parent.initializer === node && parent.type !== undefined;
    }
    if (ts.isPropertyAssignment(parent)) return parent.initializer === node;
    if (ts.isShorthandPropertyAssignment(parent)) return parent.name === node;
    if (ts.isArrowFunction(parent)) return parent.body === node;
    if (ts.isBinaryExpression(parent)) {
      return parent.right === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    }
    return false;
  }

  private visit(node: ts.Node): void {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      if (PHOTO_STORE_NAME.test(node.text)) {
        this.report(node, 'device-only-store-name', `the photo store named (${node.text})`);
      }
      if (STORE_LIST_NAME.test(node.text)) {
        this.report(node, 'generic-store-access', `a list of every store (${node.text})`);
      }
    }

    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        !(
          ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
        ))
    ) {
      const text = this.constantString(node);
      if (text !== null && PHOTO_STORE_NAME.test(text)) {
        this.report(node, 'device-only-store-name', 'the photo store named in a string');
      }
      if (text !== null && STORE_LIST_NAME.test(text)) {
        this.report(node, 'generic-store-access', 'a list of every store named in a string');
      }
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const receiver = () => this.typeOf(node.expression);
      const callee =
        ts.isCallExpression(node.parent) && node.parent.expression === node ? node.parent : null;
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : this.constantString(node.argumentExpression);
      if (name !== null) this.checkMember(node, name, receiver, callee);
      else {
        const type = receiver();
        if (this.isDatabase(type) || FileScan.isUnknownType(type)) {
          this.report(node, 'generic-store-access', 'a computed member of a database object');
        }
      }
    }

    if (ts.isObjectBindingPattern(node)) {
      let type: ts.Type | undefined;
      const receiver = () => (type ??= this.typeOf(node));
      for (const element of node.elements) {
        const key = element.propertyName ?? element.name;
        const name =
          ts.isIdentifier(key) || ts.isStringLiteral(key)
            ? key.text
            : ts.isComputedPropertyName(key)
              ? this.constantString(key.expression)
              : null;
        if (element.dotDotDotToken !== undefined || name === null) {
          if (this.isDatabase(receiver())) {
            this.report(element, 'generic-store-access', 'a database object taken apart');
          }
        } else this.checkMember(element, name, receiver, null);
      }
    }

    if (ts.isNewExpression(node) && this.isDatabase(this.typeOf(node))) {
      this.report(node, 'database-opened', 'a new database connection');
    }

    if (ts.isIdentifier(node) && (this.accessors.has(node.text) || this.aliases.has(node.text))) {
      this.checkAccessor(node);
    }

    if (FileScan.isValueUse(node) && this.isDatabase(this.typeOf(node))) {
      this.checkKeepsType(node);
    }

    ts.forEachChild(node, (child) => {
      this.visit(child);
    });
  }
}

/** Whether the device-only scan reads a file as code (other files get only the raw name rule). */
export const isScript = (file: string): boolean => SCRIPT.test(file);

/**
 * The device-only problems of the given files (repository-relative), read together as one program
 * so the type checker follows imports between them and into the dependencies.
 */
export function scanDeviceOnly(
  root: string,
  files: readonly string[],
  allowed: readonly string[],
): DeviceOnlyProblem[] {
  const scripts = files.filter(isScript);
  if (scripts.length === 0) return [];
  const projectRoot = posix.normalize(root.split('\\').join('/'));
  const absolute = (file: string) => posix.join(projectRoot, file);
  const program = ts.createProgram({
    rootNames: scripts.map(absolute),
    options: COMPILER_OPTIONS,
    host: compilerHost(),
  });
  const checker = program.getTypeChecker();
  const allowedFiles = new Set(allowed.map(absolute));
  const accessors = storeAccessors(
    [...allowedFiles].flatMap((f) => program.getSourceFile(f) ?? []),
    checker,
  );
  return scripts.flatMap((file) => {
    const source = program.getSourceFile(absolute(file));
    if (source === undefined) return [];
    return new FileScan(file, source, checker, `${projectRoot}/`, accessors, allowedFiles).run();
  });
}

/** Where a module specifier leads, when it names test data or a test helper. */
function testOnlyTarget(
  file: string,
  specifier: string,
  testSupport: readonly string[],
): string | null {
  if (specifier === '@diet/test-fixtures' || specifier.startsWith('@diet/test-fixtures/')) {
    return specifier;
  }
  if (!specifier.startsWith('.')) return null;
  const target = posix.normalize(posix.join(posix.dirname(file), specifier));
  if (target.startsWith('packages/test-fixtures/')) return target;
  const bare = target.replace(/\.[cm]?[jt]sx?$/, '');
  return testSupport.some((f) => f.replace(/\.[cm]?[jt]sx?$/, '') === bare) ? target : null;
}

/**
 * test-only-import: imports, re-exports, `import()` and `require()` of `@diet/test-fixtures`, of a
 * file in packages/test-fixtures, or of a named test helper. Read without types.
 */
export function scanTestOnlyImports(
  file: string,
  text: string,
  testSupport: readonly string[],
): DeviceOnlyProblem[] {
  const kind = /\.[cm]?[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const problems: DeviceOnlyProblem[] = [];
  const check = (node: ts.Node, specifier: ts.Expression | undefined) => {
    if (specifier === undefined || !ts.isStringLiteralLike(specifier)) return;
    const target = testOnlyTarget(file, specifier.text, testSupport);
    if (target === null) return;
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    problems.push({
      file,
      line: line + 1,
      column: character + 1,
      rule: 'test-only-import',
      detail: `imports ${target}`,
    });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      check(node, node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      check(node, node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      check(node, node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      check(node, node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
