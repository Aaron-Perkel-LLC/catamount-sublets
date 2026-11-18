# Security notes

How the community tier is held apart from students (first section), then
dependency advisories we have looked at and left in place on purpose, with
why each is unreachable here and what would change that. Check the advisory
list whenever `npm audit` reports one of them, and when the "revisit"
condition happens.

## Community accounts (phase 31, 18 Nov 2026)

Anyone can sign in now. An address at a school in `SCHOOLS`
(`src/config/site.ts`: `netid@uvm.edu`, any `@mymail.champlain.edu` or
`@champlain.edu`), the admin's own, or one the admin approved, makes a
**student** account; any other address a **community** account. The tier is
set once, by `assertEmailAllowed()` in the user-create hook, and stored on
`user.tier` (default `community`, so a path that forgets fails closed). Only
the admin changes it (People → Make student / Make community, or approving a
request), and that ends the account's sessions so the five-minute session
cache can't keep the old tier.

- **What they see.** Exactly what a signed-out visitor sees. Every read path
  asks `getViewer()` (`src/server/viewer.ts`), never "is there a session":
  Browse, Map and the listing page give anonymous and community viewers
  `PublicListing` only; `contactDetails()` returns null below student
  whatever the listing; the digest runs each recipient's own audience
  (`recipientAudience()`, from the account at send time; a missing account
  is public); the beacon records a community account's events only on public
  listings and never a contact event, so it can't probe hidden ids. Listings
  kept to students are off their board; the share link still shows its card
  (price, semester, size, distance), as it does signed out.
- **Held by.** `src/app/(board)/public-pages.test.ts` (community cases beside
  the signed-out ones, including a bogus tier), `src/server/data/listings.test.ts`
  (contact details), `src/server/services/community.test.ts` (posting, digest,
  tier switch) and `npm run check:public-leaks`, which now also requests
  every page with a community session cookie and calls the contact panel's
  Server Action over HTTP by its build id (student as the positive control).
  `check:deployment-leaks` stays signed-out only: a community session on a
  real deployment would mean creating one on a real database.
- **They can't post.** `/post` explains; every posting service
  (`src/server/services/listing.ts`), `/api/upload` and `/api/geocode` refuse
  below student.
- **Sign-in abuse.** Throwaway domains are refused (domain or any parent) from
  the vendored [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)
  blocklist (CC0), pinned to a commit in
  `src/server/auth/disposable-domains.ts` (10,400 domains at f4cad16, 18 Nov
  2026), server-only (not in any client bundle). Refresh with
  `npm run update:disposable-domains -- <sha>` and review the diff; the script
  refuses a short list and any school or big-provider domain. New community
  accounts are capped at 3 per IP per day and 20 an hour site-wide
  (`RATE_LIMITS.communityAccount*`), counted in the create hook, after a
  correct code, so a refusal tells only the mailbox owner and nothing reveals
  whether an address has an account. Students never count against either.
- **The message relay** (`src/server/services/poster-message.ts`). Community
  accounts only; public, open listings only; the poster's switch (on by
  default) and Stop email both stop it. Messages are 20–1500 characters with
  no links (refused, not stripped); 5 per sender a day, 1 per sender per
  listing a day, 10 per listing a day. Sent from
  `messages@updates.catamountsublets.com` with `RESEND_DIGEST_API_KEY`, never
  the root domain that sends sign-in codes, so spam reports can't touch code
  delivery; no key means no send (`relayBlockers()`), never a fallback.
  Reply-To is the sender, so the poster's address stays hidden until they
  reply. The email labels the sender as outside the schools, carries a scam
  warning, and never names the address. Each message is stored (sender,
  poster, listing, text, status) for 180 days, then the daily sweep deletes
  it; admin → Messages lists them and Block bans the sender.
- **Revisit when** another school joins (add it to `SCHOOLS`; the brand check
  pattern names the schools), or relay volume makes per-message review
  impractical.

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
