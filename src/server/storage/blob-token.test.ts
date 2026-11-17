import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every Blob call on the server passes an explicit read-write token, so
 * @vercel/blob never falls back to OIDC: getVercelOidcToken() never runs and
 * @vercel/cli-config (with its bundled zod 4.1.11) never loads. That is why
 * the remaining `npm audit` finding is unreachable (docs/security.md). This
 * test holds the invariant: only the files below import @vercel/blob, and in
 * the server ones every call of an imported Blob function has a `token`.
 */
const ROOT = path.join(process.cwd(), "src");
const SERVER = ["server/storage/index.ts", "app/api/upload/route.ts"];
/** The browser's upload(): it sends the file straight to Blob with a client token minted by /api/upload (above); no OIDC in the browser build. */
const BROWSER = ["components/post/PhotoManager.tsx"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

/** The value names a file imports from @vercel/blob or @vercel/blob/client (type-only imports left out). */
function blobImports(sf: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !/^@vercel\/blob(\/|$)/.test(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) names.push(clause.name.text);
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) names.push(nb.name.text);
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (!el.isTypeOnly) names.push(el.name.text);
  }
  return names;
}

/** Is `id` here the import itself, not a local of the same name (e.g. a `list` variable)? */
function refersToImport(id: ts.Identifier): boolean {
  for (let node: ts.Node | undefined = id.parent; node; node = node.parent) {
    if (ts.isSourceFile(node)) return true;
    if (ts.isFunctionLike(node) && node.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === id.text)) return false;
    if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isForOfStatement(node) || ts.isForStatement(node)) {
      const declared = node.getChildren().some((c) => declaresName(c, id.text));
      if (declared) return false;
    }
  }
  return true;
}
function declaresName(node: ts.Node, name: string): boolean {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((d) => bindsName(d.name, name));
  if (ts.isVariableDeclarationList(node)) return node.declarations.some((d) => bindsName(d.name, name));
  if (node.kind === ts.SyntaxKind.SyntaxList) return node.getChildren().some((c) => declaresName(c, name));
  return false;
}
function bindsName(b: ts.BindingName, name: string): boolean {
  if (ts.isIdentifier(b)) return b.text === name;
  return b.elements.some((e) => !ts.isOmittedExpression(e) && bindsName(e.name, name));
}

/** Every use of an imported Blob function: a call with an object argument that has `token`, or a finding. */
function untokenedUses(sf: ts.SourceFile, names: string[]): string[] {
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && names.includes(node.text) && !ts.isImportSpecifier(node.parent) && !ts.isImportClause(node.parent) && refersToImport(node)) {
      const call = node.parent;
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (!ts.isCallExpression(call) || call.expression !== node) {
        out.push(`${sf.fileName}:${line} uses ${node.text} other than by calling it`);
      } else {
        const hasToken = call.arguments.some(
          (a) => ts.isObjectLiteralExpression(a) && a.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === "token"),
        );
        if (!hasToken) out.push(`${sf.fileName}:${line} calls ${node.text} without token`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("Blob calls never fall back to OIDC", () => {
  it("only the storage module, the upload route and the browser uploader import @vercel/blob", () => {
    const importers = sources(ROOT)
      .filter((f) => blobImports(parse(f)).length > 0 || /from ["']@vercel\/blob/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(importers).toEqual([...SERVER, ...BROWSER].sort());
  });

  it.each(SERVER)("every Blob call in %s passes a token", (file) => {
    const sf = parse(path.join(ROOT, file));
    const names = blobImports(sf);
    expect(names.length).toBeGreaterThan(0);
    expect(untokenedUses(sf, names)).toEqual([]);
  });

  it("the check itself catches a call without a token, and ignores a local of the same name", () => {
    const sf = ts.createSourceFile(
      "x.ts",
      `import { del, list } from "@vercel/blob";
       async function a() { await del("k", { token: t() }); }
       async function b() { await del("k"); }
       async function c() { const list = ["k"]; await del(list, { token: t() }); }
       async function d() { await list({ prefix: "p" }); }`,
      ts.ScriptTarget.Latest,
      true,
    );
    expect(untokenedUses(sf, blobImports(sf)).map((s) => s.replace(/^x\.ts:/, ""))).toEqual(["3 calls del without token", "5 calls list without token"]);
  });
});
