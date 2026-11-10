import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, it } from "vitest";
import config from "./routes";

/**
 * Guard for the production build. React Router strips only the SERVER route exports (`loader`, `action`, `headers`) from the client
 * build; any other export stays in the client graph with the imports it needs. A route file that exports a helper next to its loader
 * and imports a `*.server` module therefore breaks `react-router build` ("Server-only module referenced by client") while
 * `npm run verify` stays green, because verify does not build. Move the helper into a `*.server.ts` file next to the route.
 */

const root = path.resolve(import.meta.dirname, "..");

/**
 * What React Router removes from the CLIENT build of a route module (`SERVER_ONLY_ROUTE_EXPORTS` in `@react-router/dev`), together with
 * whatever only they used. Every other export (`default`, `meta`, `clientLoader`, and any helper) stays, with the imports it uses.
 */
const STRIPPED_FROM_CLIENT = new Set([
  "loader",
  "action",
  "middleware",
  "headers",
]);

/** A specifier that names server-only code: a `.server` module, with or without an extension. */
const isServerSpecifier = (specifier: string): boolean =>
  /\.server(\.[cm]?[jt]sx?)?$/.test(specifier);

type Offence = { readonly exportName: string; readonly serverImport: string };

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

const specifierText = (
  declaration: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined =>
  declaration.moduleSpecifier && ts.isStringLiteral(declaration.moduleSpecifier)
    ? declaration.moduleSpecifier.text
    : undefined;

/** Local names bound by runtime imports of server modules (`import type` and `type` specifiers are erased), each mapped to its module. */
function serverBindings(file: ts.SourceFile): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = specifierText(statement);
    const clause = statement.importClause;
    if (
      specifier === undefined ||
      !isServerSpecifier(specifier) ||
      clause?.isTypeOnly
    )
      continue;
    if (clause === undefined) continue; // a bare `import "x.server"` binds nothing a export can use
    if (clause.name) bindings.set(clause.name.text, specifier);
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named))
      bindings.set(named.name.text, specifier);
    if (named && ts.isNamedImports(named))
      for (const element of named.elements)
        if (!element.isTypeOnly) bindings.set(element.name.text, specifier);
  }
  return bindings;
}

/** What a top-level statement uses at runtime: identifiers outside type positions, and the server modules it `import()`s. */
function usesOf(node: ts.Node): {
  names: Set<string>;
  dynamicServer: string[];
} {
  const names = new Set<string>();
  const dynamicServer: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isTypeNode(child)) return; // erased by the compiler, including `typeof loader`
    if (ts.isIdentifier(child)) names.add(child.text);
    if (
      ts.isCallExpression(child) &&
      child.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [arg] = child.arguments;
      if (arg && ts.isStringLiteral(arg) && isServerSpecifier(arg.text))
        dynamicServer.push(arg.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return { names, dynamicServer };
}

type TopLevel = {
  readonly exported: string[];
  readonly declares: string[];
  readonly uses: ReturnType<typeof usesOf>;
};

/** Top-level runtime statements: the names each declares, the names it exports, and what it uses. Types and imports are skipped. */
function topLevel(file: ts.SourceFile): {
  statements: TopLevel[];
  reExports: Offence[];
} {
  const statements: TopLevel[] = [];
  const reExports: Offence[] = [];
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    )
      continue;
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const from = specifierText(statement);
      const clause = statement.exportClause;
      const named =
        clause && ts.isNamedExports(clause)
          ? clause.elements.filter((e) => !e.isTypeOnly)
          : [];
      if (from !== undefined) {
        // `export { x } from "./y.server"` / `export * from`: the module itself rides along with every export it names.
        if (isServerSpecifier(from))
          for (const name of clause === undefined
            ? [`* from ${from}`]
            : named.map((e) => e.name.text))
            reExports.push({ exportName: name, serverImport: from });
        continue;
      }
      // `export { local as exported }`: the export is as server-bound as the local it names.
      for (const element of named)
        statements.push({
          exported: [element.name.text],
          declares: [],
          uses: {
            names: new Set([(element.propertyName ?? element.name).text]),
            dynamicServer: [],
          },
        });
      continue;
    }
    const exportedHere = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    const isDefault =
      ts.isExportAssignment(statement) ||
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    const declares: string[] = [];
    if (ts.isVariableStatement(statement))
      for (const d of statement.declarationList.declarations)
        if (ts.isIdentifier(d.name)) declares.push(d.name.text);
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      declares.push(statement.name.text);
    const exported = isDefault ? ["default"] : exportedHere ? declares : [];
    statements.push({
      exported: ts.isExportAssignment(statement) ? ["default"] : exported,
      declares,
      uses: usesOf(statement),
    });
  }
  return { statements, reExports };
}

/**
 * Every export that survives into the client build of a route module and reaches server-only code (directly or through a top-level
 * helper it calls), paired with the server module. The loader, action, headers and middleware are stripped, and so is a helper only they use.
 */
export function offencesIn(fileName: string, source: string): Offence[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bindings = serverBindings(file);
  const { statements, reExports } = topLevel(file);
  // A top-level name is server-bound when its statement uses a server import, or a server-bound name that is itself kept in the client.
  const serverOf = new Map<string, string>();
  const reach = (statement: TopLevel): string | undefined => {
    const [dynamic] = statement.uses.dynamicServer;
    if (dynamic !== undefined) return dynamic;
    for (const name of statement.uses.names) {
      const module =
        bindings.get(name) ??
        (STRIPPED_FROM_CLIENT.has(name) ? undefined : serverOf.get(name));
      if (module !== undefined) return module;
    }
    return undefined;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const statement of statements) {
      const module = reach(statement);
      if (module === undefined) continue;
      for (const name of statement.declares)
        if (!serverOf.has(name)) {
          serverOf.set(name, module);
          changed = true;
        }
    }
  }
  const offences = statements.flatMap((statement) => {
    const module = reach(statement);
    return module === undefined
      ? []
      : statement.exported
          .filter((name) => !STRIPPED_FROM_CLIENT.has(name))
          .map((exportName) => ({ exportName, serverImport: module }));
  });
  return [
    ...reExports.filter((o) => !STRIPPED_FROM_CLIENT.has(o.exportName)),
    ...offences,
  ];
}

/** Every route module the route table registers, as a path relative to `app/`. Only these are route modules: a helper that no route registers is stripped with the loader or action that uses it. */
function routeFiles(entries: readonly RouteConfigEntry[]): string[] {
  return entries.flatMap((entry) => [
    entry.file,
    ...routeFiles(entry.children ?? []),
  ]);
}

describe("route modules and the client build", () => {
  it("no route module exports a non-route value while importing a .server module", () => {
    const files = [...new Set(routeFiles(config))];
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.flatMap((file) => {
      const full = path.join(root, "app", file);
      return offencesIn(full, readFileSync(full, "utf8")).map(
        (o) =>
          `${path.relative(root, full)}: export "${o.exportName}" with a runtime import of "${o.serverImport}"`,
      );
    });
    expect(
      offenders,
      "Move these exports into a *.server.ts file next to the route (see this file's header).",
    ).toEqual([]);
  });

  it("catches the shape that broke the production build (a helper exported next to the loader)", () => {
    const source = [
      'import type { LoaderFunctionArgs } from "react-router";',
      'import { supportService } from "~/wiring.server";',
      "export async function readAttachmentLinks(shop: string) { return supportService().find(shop, shop); }",
      "export const loader = async (_: LoaderFunctionArgs) => readAttachmentLinks('a');",
    ].join("\n");
    expect(offencesIn("links.ts", source)).toEqual([
      { exportName: "readAttachmentLinks", serverImport: "~/wiring.server" },
    ]);
  });

  it("accepts route exports, type exports and type-only server imports", () => {
    const source = [
      'import type { Thing } from "~/models/thing.server";',
      'import { type Other } from "~/models/other.server";',
      'import { loaderHelper } from "~/admin/helper.server";',
      "export type Result = Thing | Other;",
      "export interface Props { a: string }",
      "export const loader = () => loaderHelper();",
      "export const handle = { a: 1 };",
      "export default function Page() { return null; }",
    ].join("\n");
    expect(offencesIn("page.tsx", source)).toEqual([]);
  });

  it("sees re-exports, named export lists and dynamic imports", () => {
    expect(
      offencesIn(
        "a.ts",
        'import { x } from "~/a.server";\nconst helper = () => x();\nexport { helper, x as loader };',
      ),
    ).toEqual([{ exportName: "helper", serverImport: "~/a.server" }]);
    expect(offencesIn("b.ts", 'export * from "~/b.server";')).toEqual([
      { exportName: "* from ~/b.server", serverImport: "~/b.server" },
    ]);
    expect(
      offencesIn("c.ts", 'export const helper = () => import("~/c.server");'),
    ).toEqual([{ exportName: "helper", serverImport: "~/c.server" }]);
  });
});
