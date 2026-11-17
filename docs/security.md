# Security notes

Dependency advisories we have looked at and left in place on purpose, with
why each is unreachable here and what would change that. Check this list
whenever `npm audit` reports one of them, and when the "revisit" condition
happens.

## Accepted: `@vercel/oidc` 3.x → `@vercel/cli-config` 0.3.1 → bundled zod 4.1.11

Recorded 17 Nov 2026.

- **Advisory:** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
  (CVE-2023-54404, high). zod up to 4.6.5 keeps one issue per failing element
  of an array, so a large array can exhaust memory. `npm audit` reports it
  as `@vercel/blob`, `@vercel/oidc` and `@vercel/cli-config` (high).
- **Where it comes from:** `@vercel/blob` 2.9.0 depends on `@vercel/oidc`
  `^3.6.1`, which pins `@vercel/cli-config` 0.3.1. That package is a single
  bundle with zod 4.1.11 compiled into `dist/index.js`, so an npm `overrides`
  entry for its zod changes the dependency tree (and quiets `npm audit`) but
  not the code that runs. We tried that and dropped it.
- **Why it is unreachable:** every server-side Blob call passes an explicit
  read-write token (`BLOB_MEDIA_READ_WRITE_TOKEN` or
  `BLOB_UPLOADS_READ_WRITE_TOKEN`): `put`, `head`, `get`, `list` and `del` in
  `src/server/storage/index.ts`, and `handleUpload` in
  `src/app/api/upload/route.ts`. With a token, `@vercel/blob` never calls
  `getVercelOidcToken()`; the oidc modules that load `@vercel/cli-config`
  (`token.js`, `token-util.js`) are imported only inside that call, so
  `cli-config` never loads in production. Even if it did, the only thing its
  zod parses is the local Vercel CLI's auth file, after finding
  `.vercel/project.json`; no request data reaches it. The browser's
  `upload()` (`PhotoManager.tsx`) uses a client token minted by
  `/api/upload` and has no OIDC path.
- **Held by:** `src/server/storage/blob-token.test.ts`, which fails if any
  other file under `src/` imports `@vercel/blob`, or if a server Blob call
  lacks a `token`.
- **Revisit when:** `@vercel/blob` depends on `@vercel/oidc` 4.x (which
  brings `cli-config` 0.4.0 with zod 4.6.7; then this entry goes), or we ever
  switch Blob to OIDC auth (drop the read-write tokens), which would make
  this path live.

## Not deployed: dev-only tooling

`drizzle-kit` (its `@esbuild-kit` loader pulls in esbuild 0.18), typescript-eslint,
glob/minimatch, fast-uri and react-email have moderate advisories. None of them
is in the deployed bundle; drizzle-kit runs only from a developer's machine for
`db:generate`/`db:migrate`. drizzle-kit 0.31.11 is the latest, so there is no
clean bump yet. Revisit when drizzle-kit drops `@esbuild-kit`.
