# Catamount Sublets

A sublet marketplace for University of Vermont students, live at
[catamountsublets.com](https://catamountsublets.com). Students sign in with
their university email, post one sublet listing each, and browse the others by
price, semester, distance from campus and amenities, on a grid or a map. A
listing can be shared outside sign-in through a public preview link.

It replaced "UVM Sublets", a PHP app on UVM's Silk shared hosting with CAS
sign-in and MySQL on UVM's database server, in a live cutover on 9 October
2026: listings, accounts, photos and old share links all carried over. An
independent student project, not affiliated with the University of Vermont.

## Stack

- Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4
- Neon Postgres through Drizzle ORM; plain-SQL migrations in `drizzle/`
- Better Auth with email one-time codes, restricted to `uvm.edu` addresses,
  plus its admin plugin for roles and bans
- Zod for every form and Server Action input, and for the environment
- sharp for photo processing; MapLibre GL for the maps
- Vercel hosting, Vercel Blob for photos, Vercel Cron for the daily sweep
- Resend for mail, with react-email templates
- Vitest against an in-process PGlite Postgres; GitHub Actions CI (lint,
  typecheck, tests, brand check, build)

## How it works

- **Who may sign in.** `assertEmailAllowed()` (`src/lib/auth-allow.ts`) runs
  in a Better Auth before-hook on the send-code endpoints *and* in the
  user-create database hook, so no code is ever mailed to, and no account
  created for, an address outside `ALLOWED_EMAIL_DOMAINS` in
  `src/config/site.ts`. UVM mailboxes answer to both `netid@uvm.edu` and
  `first.last@uvm.edu`; only the NetID form is accepted, so one person is one
  account and migrated accounts (keyed on the NetID) are found again on sign-in.
- **Photos.** The browser uploads straight to a private Blob store with a
  server-minted token and a server-chosen pathname. `src/server/images/process.ts`
  sniffs the bytes, turns the image upright, caps it at 3000 px, strips
  everything but the ICC profile (GPS included) and writes a display WebP, a
  thumbnail WebP and a JPEG share-card variant to the public store. A raw
  upload is never served; a daily cron sweeps leftovers.
- **Authorisation in the data layer.** Every mutating function takes the
  acting user's id and filters by it; a zero-row update is a 404. Admin
  actions start with `requireAdmin()`.
- **Rate limits.** Postgres-backed, in `src/server/rate-limit.ts`: codes and
  verification attempts per address and per IP, listing creation per person,
  access requests and survey answers. Better Auth's own per-IP counters stay
  as a backstop.
- **Admin console** (`/admin`): people (with bans and account deletion),
  access requests, semesters and archiving, announcements with a read-only
  maintenance switch, images and orphan files, an activity log with charts,
  and survey results.
- **Legacy migration.** `scripts/migrate-legacy/` reads the old MySQL data (a
  phpMyAdmin dump or a live connection), maps NetIDs to email accounts, keeps
  listing and photo ids so old links resolve, recomputes legacy share tokens,
  and reprocesses every photo. It is a dry run by default; `--apply`,
  `--images` and `--prune` write, and `--verify` compares every row and every
  file by hash afterwards. The cutover plan, runbook and rollback are in
  `PLAN.md` §6 and `docs/cutover-runbook.md`.

## Run locally

Prerequisites: Node 24 (`.nvmrc`) and npm. No database or cloud account is
needed: with no `DATABASE_URL` the app uses an in-process PGlite Postgres in
`.pglite/`, migrated on first use, and with no `RESEND_API_KEY` mail
(sign-in codes included) is printed to the console.

```bash
npm install
npm run db:seed    # sample semesters, posters and listings (not while `npm run dev` is up)
npm run dev        # http://localhost:3000
```

To use real services, copy `.env.example` to `.env.local` and fill in only
what you need. Delete the lines you leave empty: `src/env.ts` validates the
environment at boot and rejects an empty value. The variables:

| Variable | What it is |
|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Postgres connection strings, pooled for the app and direct for migrations. Unset: PGlite. |
| `APP_SECRET` | Signs share tokens and analytics actor keys. |
| `BETTER_AUTH_SECRET` | Better Auth's session secret. |
| `SURVEY_SECRET` | Signs feedback-survey links. |
| `APP_URL` | The canonical origin, e.g. `http://localhost:3000`. |
| `RESEND_API_KEY` | Resend API key for real mail. |
| `BLOB_UPLOADS_READ_WRITE_TOKEN`, `BLOB_MEDIA_READ_WRITE_TOKEN` | Vercel Blob tokens for the private uploads store and the public media store. Unset: files go to `.uploads/` on disk. |
| `CRON_SECRET` | Bearer token the cron route requires. |

Other scripts:

```bash
npm test               # vitest; data tests boot PGlite and run the real migrations
npm run lint
npm run typecheck
npm run build
npm run check:brand    # fails on legacy wording outside an allowlist
npm run db:generate    # write a migration from the Drizzle schema
npm run db:migrate     # apply migrations to DATABASE_URL_UNPOOLED (a real Postgres)
npm run email:dev      # preview the email templates on :3001
```

## Layout

```
src/app          routes: landing, s/[slug], sign-in, survey; (app) browse, map, post, account, admin
src/config       site.ts: names, addresses, allowed email domains, limits
src/db           Drizzle schema, client, seed
src/lib          domain code shared by server and client (semesters, share, …)
src/server       server-only: actions, data access, email, images, storage, log
src/components   UI
src/emails       react-email templates
scripts          migrate-legacy (one-off import), admin scripts (delete-user, mail)
docs             setup and cutover notes
```

`PLAN.md` is the migration plan and status board; `CLAUDE.md` is the guide
for working in this repo.

## License

Source available for viewing; all rights reserved. See [LICENSE](LICENSE).
