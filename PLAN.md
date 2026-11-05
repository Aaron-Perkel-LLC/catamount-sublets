# Catamount Sublets — migration plan

**From:** UVM Sublets, PHP 8.2 on UVM Silk shared hosting, MySQL on UVM's database server, Apache CAS sign-in, live at `sublet.aperkel.w3.uvm.edu` (published as `go.uvm.edu/sublet`).
**To:** Catamount Sublets at `catamountsublets.com` — Next.js (App Router) + TypeScript on Vercel, Neon Postgres, email one-time-code sign-in restricted to `@uvm.edu`, no UVM hosting, branding or wording.

## Status

| Phase | State | Notes |
|---|---|---|
| 0 Repo and scaffold | **done** | scaffold, deps, config, PLAN, docs; cloud resources created 8 Oct (Vercel Hobby project, Neon project with `main`/`rehearsal`/`dev`, both Blob stores, env vars) — `docs/vercel-setup.md`; Resend domain + DNS records are Aaron's |
| 1 Schema, migrations, helpers | **done** | first migration `drizzle/0000_*.sql`; 29 tests on PGlite; auth config built |
| 2 Auth | **done (local)** | end-to-end sign-in verified on PGlite with console-mode mail; the real-mailbox test needs the Resend domain (your go-ahead) |
| 3 Browse, listing view, Map | **done (local)** | Browse with live filters, listing view (gallery, contact panel, deep links), Map with pins and popups; smoke-tested on seeded PGlite; the map canvas itself needs a browser check on a preview |
| 4 Post form and photos | **done (local)** | form, address combobox on Photon, map pin, client uploads + sharp pipeline, photo reorder/cover/delete, semesters, status panel, delete, admin notices; lifecycle test on PGlite; smoke-tested |
| 5 Share | **done (local)** | `/s/[slug]` with three states and meta tags, `next/og` cards (og + story) with fallbacks, share sheet with story-image file share, dual-secret tokens; smoke-tested |
| 6 Activity log | **done (local)** | `/api/events` beacon with dedupe, exclusions and rate limit; readers for the Activity tab; poster stats line; tested on PGlite |
| 7 Admin | **done (local)** | seven tabs (semesters + archive with manifest, announcement + read-only switch, posts, images + orphans, people with ban/delete, email broadcast, activity); account deletion; daily cron sweep; services tested on PGlite |
| 8 Brand, copy, polish | **done (local)** | landing page with the live board, mark + SVG favicon, 404/error/privacy pages, nonce CSP in `src/proxy.ts` + static headers in `next.config.ts`, `npm run check:brand` (also in CI), contrast pass (maple darkened to 5.0:1), seed/sample emails read the allowed domain from config. Still yours: redraw the og/story graphics in a design tool if the generated fallbacks are not enough; MapLibre under the CSP needs a browser check on a preview |
| 9 Migration script + delete-user | **done** | dump parser + mysql reader, transform, apply/prune/images/verify, CLI, README, `delete-user`; rehearsal #1 on `rehearsal` 8 Oct; cutover import on `main` 9 Oct from the frozen dump: 45 users (44 posters + the admin), 44 listings, 199 photos (196 reused, listing 220's 3 new), 0 opt-outs, verify clean |
| 10 Cutover prep | **done** | legacy prep commits live on Silk 8 Oct (`.sql` refusal, move notice, freeze rule, shim); welcome mail + `send-welcome`, launch gate, runbook |
| 11 Cutover day | **done: Fri 9 Oct 2026** | freeze + dump 07:45 ET; restore branch `pre-cutover-2026-10-09` 07:50; import applied; site opened 07:59 (read-only), Silk shim in, smoke test passed, writes on 08:03; photo uploads were blocked by the CSP (`connect-src` lacked `vercel.com/api/blob/`), fixed in `a568a8a` and live 08:12; welcome mail to 44 posters 08:14–08:15 via Resend, 0 failed. Rollback window to Sun 11 Oct 08:00 |
| 12 Decommission | **in progress** | T+2 d 301 switch done (6 rules, `no-store` dropped; checked 17 Oct). T+7 d started 17 Oct, record in §6.5. T+90 d (remove the shim and delete `go.uvm.edu/sublet`, the same day) not before 7 Jan 2027 |
| 13 Post-launch polish | **done: merged 9 Oct 2026** | footer without the DM; who-it's-for note with Request your school / Request access (`access_requests`, migration 0004, on `rehearsal` only); photos picked first on a new post and uploaded on Post; listings show the account name, never a login; dropdowns styled; current page marked in the nav; /welcome hydration, local PGlite-per-bundle and whole-dollar price fixes. Then: refused saves focus the first bad field (post form, /request, name form); after Post the page returns to the top with "Your listing is live"; My post reordered (status bar, photos, details, manage with in-place confirms); and all 12 design-audit fixes. Merged 9 Oct: migration 0004 applied to `main` first (5 migrations, `access_requests` empty), `main` fast-forwarded to `5608b7f`, production deploy Ready; home card, /request and poster names checked on production (44 listings: 15 account name, 6 old name shown, 23 "the poster", 0 showing a login); `polish` deleted. The `display_name` column is unused and stays until a migration on Aaron's go-ahead |
| 14 Legal footer | **done: on `main` since 9 Oct 2026** (went out with item 15) | footer line is "Catamount Sublets · © <year> Aaron Perkel LLC" (LLC linked to aaronperkel.com, "Built by" credit dropped, year from Eastern time); privacy page opens with "operated by Aaron Perkel LLC, Burlington, Vermont" and the support email; every email ends with the same copyright line. No migration. |
| 15 Map popup, name, pan | **done: merged 9 Oct 2026** | popup's own corners, padding and a round close chip finally apply (MapLibre's unlayered CSS was beating the layered overrides); a saved first name shows on Account even when it matches the email's local part, and the greeting trusts a complete name too; opening a pin pans it to the middle with room for the popup, which always opens above. No migration. `main` fast-forwarded to `864ae19`, production deploy Ready |
| 16 Card photo height | **done: merged 10 Oct 2026** | portrait photos stretched their cards on Chrome and Edge (Chromium lets an in-flow `h-full` image grow an aspect-ratio box; Safari kept 4:3); the card photo is now `absolute inset-0`, so every card photo is 4:3 everywhere. No migration. `main` fast-forwarded to `d09cfe4`, production deploy Ready |
| 17 Admin cleanup, notices, footer | **done: merged 11 Oct 2026** | after a few days' use: admin notices lead with the poster's name (email after) and link to `/admin#post:<id>`; admin sections in a sidebar on desktop and one picker on a phone, People first; Posts folded into People (sortable, newest first, each post opens in the listing view with status, photos and delete; old `#posts`/`#email`/`#announcement` links still land); Activity redrawn (line chart with axes, legend and crosshair tooltip, labelled bar lists, sortable table, Poster links to the person); Announce = banner + email + read-only under a folded Maintenance; launch gate removed (a `launched` row may remain in production's `site_settings`, unread); Semesters grouped on the board / hidden with an archive dialog; footer in two lines. No migration. `main` fast-forwarded to `505a3a2`, production deploy Ready; front page (board, two-line footer, no gate) checked on production |
| 18 Name punctuation | **done: merged 11 Oct 2026** | one new account (Oct 10, Snapchat's in-app browser on an iPhone) signed in but never saved a name; while checking, found the name rule refused an iPhone's curly apostrophe (O’Brien) with a message saying apostrophes are allowed, and refused periods (St. John). `checkName` now saves ’ ‘ ʼ as a plain ' and allows a period after the first letter; name guesses for migrated accounts still skip an initial as a last name. No migration. `main` fast-forwarded to `3e2e7ea`, production deploy Ready |
| 19 Brand masters in repo | **done: merged 12 Oct 2026** | the logo asset pack's SVG masters, `mark-small.svg`, social SVGs and build script (`brand/source/build.mjs`, glyph outlines) live in `brand/`; a rebuild matches the pack and the site's five icon/share files byte for byte. PNG exports, the original concepts and the contact sheet are kept outside the repo. No migration |
| 20 Privacy operator | **done: merged 12 Oct 2026** | privacy page opens with "Last updated" and a "Who runs this site" section (Aaron Perkel LLC, a Vermont LLC doing business as Catamount Sublets, registered assumed name; Burlington, Vermont; contact), with the not-affiliated line under it; the email footer's copyright now links the LLC like the site footer (site footer already matched; no "Built by", no "d/b/a"). No migration. `main` fast-forwarded to `b2b3ee7`, production deploy Ready; `/privacy` checked on production |
| 21 Approve access requests | **done: merged 16 Oct 2026** | admin **Requests** section (count badge in the nav): pending front-page requests with Approve / Dismiss, and the approved addresses with Remove. Approvals live in `site_settings` row `approved_emails`; both auth hooks accept an address refused only for its domain when it is approved; the sign-in form leaves the domain check to the server. Approve/Dismiss set `access_requests.handled_at`. Removing an address stops new sign-ins only (ban in People to cut off an account). No migration |
| 22 Feedback survey | **done: merged 2 Nov 2026** | every account gets a note from Aaron with a signed 60-day link to `/survey` (no sign-in, so no code spent), ten questions with an "I haven't used the new site yet" branch, one row per account (`survey_responses`, migration 0005), answers replaceable; admin **Survey** section with the response rate, tallies and the free text; `send-survey` (dry run, `--review`, `--link`, `--to`, `--apply`, resumable log) and `survey-export` (CSV); the note's P.S. and one question mention Lejer (`ALSO_BY` in site config); privacy page says the operator may email occasionally. 0005 applied to `rehearsal` and `main` 2 Nov. Follow-up (branch `survey-secret`, 2 Nov): links are signed with their own `SURVEY_SECRET` (Vercel Production and `.env.local`), not `APP_SECRET`, which Aaron cannot read back and must not rotate; a deployment without it shows the invalid-link page for every link. Nothing sent without Aaron's go-ahead |

Last updated: 2026-11-02 (feedback survey on branch `survey`, phase 22; decommission under way, §6.5; `approve-requests` merged 16 Oct). The legacy code is a local clone of its private, archived repository (this repo's `sublets-legacy/` symlink, gitignored). The dumps, the legacy env file and the rsynced originals were deleted at decommission; the steps that use them in the runbooks and HANDOFF.md are historical.

Execution rules in force: stop and ask before anything external or irreversible (email, DNS, the Silk server or its database, writes to the production database, buying or upgrading a plan, deleting data anywhere); never commit the dump, `.env` files or real user data; local/test data only until the real rehearsal is approved; a two-line summary at the end of each phase.

### Merge checklist: `polish` → `main`

A push to `main` deploys production, so in this order, each step on Aaron's go-ahead:

1. **Apply migration 0004 to Neon `main` before merging** (`DATABASE_URL_UNPOOLED` from `neonctl connection-string main …`, then `npm run db:migrate`); check that `access_requests` exists and is empty.
2. Merge `polish` into `main` and push; wait for the production deploy.
3. Verify the request form on production: one submission from the front page's "Request access", which sends one email to the requests address; then mark or delete that row.
4. Confirm the preview test photos are deleted from the shared Blob stores (Preview writes to the production `media` and `uploads` stores; the pathnames were logged in the private working folder).
5. Smoke test on a phone: new post with photos, a listing's poster name, the nav's current page, the dropdowns.

---

## 0. Decisions

### 0.1 Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict, npm, `src/` | Your other projects. Server Components for the read side, Server Actions for mutations, Route Handlers for the beacon, uploads, auth and share cards. |
| Database | Neon Postgres (Vercel integration), `@neondatabase/serverless` Pool (WebSocket) so transactions work | As in `red-king-registration`; branches for the migration rehearsal; point-in-time restore as the rollback. |
| ORM | **Drizzle**, `casing: "snake_case"`, migrations in `./drizzle` (see 0.2) | SQL-shaped app; plain-SQL migrations; first-party better-auth adapter; already used in two of your projects. |
| Auth | **better-auth** with its `emailOTP` and `admin` plugins, Drizzle adapter, DB-backed sessions and rate limits (see 0.3) | Only mainstream library with a first-party email *code* flow; the admin plugin gives roles and bans. |
| Email | **Resend** on the paid plan for the launch month, sending as `Catamount Sublets <login@catamountsublets.com>` with `Reply-To: aaron@catamountsublets.com` (root domain, verified 8 Oct); templates with `@react-email/components`; console mode outside production (as in `lejer`) | Transactional API, batch send for broadcasts; Resend's return path is a CNAME, so iCloud's apex MX and SPF are untouched. |
| Photos | **Two Vercel Blob stores**: a *private* `uploads` store for raw client uploads, a *public* `media` store for sharp's output (see 2.6) | Vercel functions cap request bodies at 4.5 MB; legacy allows 30 MB per photo. The private store means an unstripped phone photo (GPS) is never reachable. |
| Share images | `next/og` `ImageResponse` (Satori), Node runtime, CDN-cached | Replaces the GD painter. Satori cannot embed WebP, so each photo also gets a JPEG card variant. |
| Maps | MapLibre GL JS directly (OpenFreeMap Positron style, recoloured), Esri light-grey raster fallback | Drops Leaflet and the vendored bridge; one library. |
| Geocoding | **Photon** (komoot) for address suggestions, Nominatim for reverse lookups of a dropped pin, both proxied behind the session and rate-limited | Nominatim's usage policy forbids autocomplete; the legacy form violates it. Decided. |
| Styling | **Tailwind v4** with the palette as `@theme` tokens, hand-written components (no shadcn) | Four of your six Next.js projects use Tailwind v4. Decided. |
| Validation | zod on every Server Action and Route Handler input; `env.ts` validated at boot | Required; also fixes the legacy's browser-only validation. |
| Fonts | **Bricolage Grotesque** via `next/font/google`; the static TTFs kept in `assets/fonts/` for the share cards | Decided. |
| Tests | vitest + PGlite (in-process Postgres) for unit and data-access tests, as in `red-king-registration` | No Docker on this machine; PGlite runs Drizzle migrations for real. |

### 0.2 ORM: Drizzle, not Prisma

- **The app is SQL-shaped.** Distance from campus is a haversine expression in SQL (`listing_query.php:29`), visibility is an `EXISTS` over two tables (`visibility.php:34-38`), semester names are `COALESCE`d, the activity tab is grouped aggregates and the archive computes a median. Drizzle's `sql` template keeps that readable and typed. In Prisma those become `$queryRaw` strings that bypass the schema types.
- **Migrations are reviewable SQL.** The legacy's worst operational habit is "schema changes pasted into phpMyAdmin by hand" with `table_columns()` guards so code survives a half-applied change. `drizzle-kit generate` writes a numbered `.sql` file you read in the PR; `drizzle-kit migrate` runs it in `vercel build`. No codegen step.
- **better-auth ships a Drizzle adapter** and `npx @better-auth/cli generate` emits the auth tables as Drizzle schema, so the auth tables live next to yours.
- **Neon over the serverless driver.** Prisma 7 dropped the Rust engine and now also requires a driver adapter, so the gap has narrowed, but it still carries a schema DSL that would duplicate what the TypeScript already states.
- What you give up: Prisma Studio and the richer relational query API. At 43 listings and one developer, neither matters. One Drizzle limitation shapes the schema: `drizzle-kit` cannot emit `DEFERRABLE` constraints, so photo reordering is done in a transaction without a `(listing_id, sort_order)` unique (2.2).

### 0.3 Auth: better-auth email OTP, not Auth.js

- **Auth.js's email provider is magic links only.** A code flow needs a custom `generateVerificationToken` plus a page that reassembles the callback URL; it is a workaround, and `next-auth@5` is still published on the beta tag. Codes also beat links for a Microsoft 365 audience: Outlook's Safe Links rewrites and pre-fetches links, which can consume a one-time link before the student clicks it.
- **better-auth `emailOTP`** is first-party: `sendVerificationOTP({email, otp, type})`, `otpLength: 6`, `expiresIn`, `allowedAttempts` (default 3, then the code is dead), `storeOTP: 'hashed'`. Sign-in with a code on an unknown email creates the account, which is the legacy's "any student can show up" model.
- **`admin` plugin** supplies `role`, `banUser`/`unbanUser` (refuses sign-in and revokes sessions) and an admin API, replacing both `ADMIN_UID` and the `allowed_users` block list.
- **Rate limiting in the app, Postgres-backed** (`src/server/rate-limit.ts`): sign-in codes per address and per IP, verification attempts per address and per IP, listing creation per person; better-auth's own `storage: 'database'` per-IP counters stay as a loose backstop. No WAF: the plan is Vercel Hobby (decided 8 October). The per-IP limits are deliberately loose because campus networks put many people behind one address.
- **One function, two hooks** enforce the allowed-address config so no code is ever sent to, and no user row ever created for, a disallowed address (5.1). Config lives in one file:

```ts
// src/config/site.ts
export const ALLOWED_EMAIL_DOMAINS = ['uvm.edu'] as const;              // add schools here
export const ALLOWED_EMAILS = ['<admin address>'] as const;             // exact-address exceptions; the admin
export const SUPPORT_EMAIL = 'aaron@catamountsublets.com';
export const ADMIN_NOTICE_TO = 'aaron@catamountsublets.com';
```

- **The admin is the operator's own non-UVM address from day one** (decided), the one entry in `ALLOWED_EMAILS`. The migration maps the legacy admin's NetID to that address, so the legacy admin's own listing lands on the admin account; the admin's `@uvm.edu` address is not seeded (signing in with it would create an ordinary empty account).
- The hand-rolled alternative (a `login_codes` table, as `lejer` does) is viable but re-implements sessions, cookie flags, origin checks, attempt counting, bans and deletion cascades. The cost of better-auth: five generated tables (`user`, `session`, `account` — present even without passwords — `verification`, `rate_limit`) and version churn; the version is pinned and the schema regenerated deliberately.

### 0.4 Email provider and DNS

Mail is sent **from the root domain** (`Catamount Sublets <login@catamountsublets.com>`; admin notices and access requests from `notices@`, broadcasts and the welcome from `aaron@`, revised 15 Oct; `Reply-To: aaron@catamountsublets.com` on every message; revised 8 Oct from a `mail.` subdomain). Inbound stays iCloud's. Admin notices go *to* `aaron@catamountsublets.com`. Records as added: `TXT resend._domainkey`, `CNAME send` and `CNAME rsend` to Resend's `forge.rmta.net` hosts, `TXT _dmarc` at `p=none`; see `docs/vercel-setup.md` §2.

**Resend plan: paid for the launch month** (decided). The free tier's 100/day cap is the reason; on the paid plan there is no daily cap, so one-time codes never compete with the welcome mail for quota. Independently of the plan, codes are sent directly and synchronously from the auth hook, while broadcasts go through a separate chunked sender (`lib/email/broadcast.ts`, 50 per batch call, paced) that can never sit in front of a code.

**Records to add** (names relative to the zone `catamountsublets.com`; copy exact values from the Resend and Vercel dashboards — these are the documented shapes):

| Purpose | Type | Name | Value | Notes |
|---|---|---|---|---|
| Web, apex | A | `@` | `76.76.21.21` | Use the IP the Vercel domain card shows; newer projects get a different anycast address. Never a CNAME/ALIAS at the apex — it would shadow the MX records. |
| Web, www | CNAME | `www` | value from the domain card | Vercel redirects `www` → apex. |
| Resend bounce/complaint MX | MX | `send.mail` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | Region as shown in Resend. |
| Resend SPF | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | |
| Resend DKIM | TXT | `resend._domainkey.mail` | `p=<key from Resend>` | DNS-only, not proxied. |
| DMARC for the mail subdomain | TXT | `_dmarc.mail` | `v=DMARC1; p=none; rua=mailto:aaron@catamountsublets.com;` | Start at `p=none`; move to `quarantine` after a clean week of reports, then `reject`. |

**Records that already exist and are not touched** (iCloud Mail at the apex): `MX @ mx01.mail.icloud.com (10)`, `MX @ mx02.mail.icloud.com (10)`, `TXT @ apple-domain=…`, `TXT @ v=spf1 include:icloud.com ~all`, `CNAME sig1._domainkey → sig1.dkim.catamountsublets.com.at.icloudmailadmin.com`.

**Conflict check.** No new record shares a (name, type) pair with an iCloud record: Resend's live under `send.mail`, `resend._domainkey.mail` and `_dmarc.mail`; Vercel's are `A @` and `CNAME www`, and A records coexist with MX/TXT at the apex. The apex SPF is not involved because Resend's envelope sender is `…@send.mail.catamountsublets.com`. If an apex `_dmarc` record already exists it also governs subdomains by default; that is fine, because Resend's DKIM signature (`d=mail.catamountsublets.com`) aligns with the From domain. If a CAA record exists it must permit `letsencrypt.org`.

**Deliverability to `uvm.edu`** (a Microsoft 365 tenant) is the real risk: a new domain's first messages will land in Junk for some people. Mitigations: DKIM + custom Return-Path + DMARC on the subdomain; the OTP mail is a plain code with no links; test delivery to real `@uvm.edu` mailboxes from a preview deploy as soon as the domain verifies (Phase 2); the sign-in screen says "check Junk" and offers a resend after 60 s; Resend bounce webhooks are logged.

### 0.5 Visual identity

Nothing green, nothing gold, no house-on-a-gold-tile mark, **no athletics-style lettering and no "fellow Catamounts" copy** (decided); the footer keeps "an independent student project, not affiliated with the University of Vermont". The mark is a cat after all (decided 9 Oct, reversing the earlier "no cat silhouette"): an original drawing of a cat lying on a house roof, redrawn from a friend's concept and deliberately not the Catamount statue's pose. Palette, "Lake and Maple": a deep Champlain blue as the brand colour, a maple-leaf terracotta as the single accent, warm neutrals instead of UVM's cool slate. Approximate contrast ratios are given; validate the final values with a contrast checker before locking them (Phase 8).

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--lake` | `#1D4F73` | Primary: nav, primary buttons, links, pins | 8.7:1 on white |
| `--lake-deep` | `#163E5B` | Hover/pressed | |
| `--maple` | `#BC4C25` | Accent: price tabs, active pin, highlights; white text on it | 5.0:1 on white (darkened from #C9552B in Phase 8, which gave 4.4:1 under white text) |
| `--maple-ink` | `#A3401C` | Accent as small text | 6.4:1 on white |
| `--cream` | `#F7F3EC` | Page background | |
| `--paper` | `#FFFFFF` | Cards, sheets | |
| `--ink` | `#1C2328` | Body text | 15:1 |
| `--ink-2` | `#4A565E` | Secondary text | 7.4:1 |
| `--ink-3` | `#5F6B74` | Muted text (5.0:1 on cream) | |
| `--line` / `--line-light` | `#E3DED6` / `#EFEBE4` | Borders | |
| `--focus` | `#1D4F73`, 3px ring, 2px offset | Keyboard focus | |
| Tints (tint / ink / line) | included `#E6F0E9 / #27624A / #C6DDCC` · tenant `#FBF1DF / #7A5A12 / #F1DFB5` · error `#FBE6E0 / #9F3618 / #F3C2B4` · notice `#E6EFF6 / #1D4F73 / #C4D8E8` | Same four semantic sets as the legacy | |

Map: `MAP_COLOURS` keep their neutral land/water values; the campus wash becomes a sand `#EEE9DF` (no gold); pins are lake, the active pin maple. Mark: "roof cat", a lake house with a maple cat lying over the ridge (`src/components/Mark.tsx`; the favicon is the same drawing on a lake tile). Type: Bricolage Grotesque, weights 400 and 700, the legacy's seven-step scale.

Every graphic in the legacy `assets/social/`, `assets/uvm-sublets-print/` and `assets/uvm-sublets-promo/` is painted green/gold with "UVM Sublets" and `go.uvm.edu/sublet`; none can be reused. They come from a design tool, not code, and need redrawing with the new domain (Phase 8, your time rather than the coding agent's).

**Instagram:** the account is being renamed to **`@catamountsublets`** (decided). It is the handle in `src/config/site.ts`; the legacy site's four references (`includes/share.php`, `landing.php`, footer, broadcast template) are updated in the legacy prep branch (Phase 10) and go live with the next deploy to Silk.

---

## 1. Inventory of the legacy app

### 1.1 Pages

| Path | File | Auth | What it does |
|---|---|---|---|
| `/` | `landing.php` | none | Pitch, a board of up to 12 current listing thumbnails, live count, semester phrase, CTA to `/app/`. Self-contained (own CSS, inline SVG). og/twitter tags; `og:url` is the short link, `og:image` on the real host. Includes the move notice. Survives a DB outage. |
| `/s/<id>-<token>` (→ `s.php?i=`) | `s.php` | none | Share interstitial. Three states: open (preview card lines + "Sign in" button to `/app/index.php?id=N&via=share`), taken (generic text, generic image), unavailable (404 for bad token / unknown id / paused / hidden / DB down — one page, no oracle). `noindex`. |
| `/share-card.php?i=<slug>&f=og\|story` | `share-card.php` | none | Renders 1200×630 or 1080×1920 JPEG with GD: photo in a near-square panel, price, semester, facts, "UVM SUBLETS", `go.uvm.edu/sublet`. Cached in `public/share/<id>-<fmt>-<md5>.jpg`; falls back to `assets/social/*.png` on any failure; bad slug = empty 404. `Cache-Control: max-age=86400`. These URLs are what Meta and X have cached as `og:image`. |
| `/app/` | `app/index.php` | CAS | Browse: filter bar, sort bar, grid of cards with every listing field as `data-*` (incl. NetID, contact email, phone), listing modal, share sheet. Live filter updates. `?id=` deep link drops filters and opens the modal; `via=share` tags the arrival. No pagination. |
| `/app/map.php` | `app/map.php` | CAS | Same filters (form submit, not live). Emits `MAP_SUBLETS` = `SELECT s.*` for every visible listing plus derived fields. Price-tag pins grouped at 4 decimal places. |
| `/app/post.php` | `app/post.php` | CAS (owner by construction) | Create/edit the signed-in user's one listing; photo upload; status actions; delete. Stats line (views/contacts/shares). |
| `/app/admin.php` | `app/admin.php` | admin | Eight tabs: Semesters (+ archive), Announcement, Posts, Images, Users, Email, Activity (`?range=open\|30d\|all`), Access. |
| `/recover/` | `recover/index.php` | CAS `Require user <admin NetID>` + `require_admin()` | Break-glass restore of `app/.htaccess` from backups. Never loads the DB. **Obsolete after the move.** |
| `/demo` | root `.htaccess` | — | 302 to `/` (retired demo). Kept as a redirect on the shim. |

Chrome shared by every `/app/` page (`includes/header.php`, `footer.php`): nav (Browse/Map carry filters, New Post/My Post, Admin), user chip, announcement banner from `data/announcement.json`, move-notice modal, footer (credit, Instagram DM as the only support route, disclaimer, "views and contact taps are counted" disclosure). `header.php` runs ~5 queries on every page.

### 1.2 API endpoints (`app/api/`, form-encoded POST in, JSON out)

| File | Gate | Actions / params | Notes |
|---|---|---|---|
| `events.php` | signed in, `require_same_origin` | POST `type, listing_id, source?, target?` → 204, 429 at ≥60/min/actor | Whitelists in `includes/events.php`. Admin excluded; poster excluded except share types. Dedupe per **Eastern** day for `listing_open`, `map_pin_open`, `share_open`, `share_arrival`. |
| `geocode.php` | signed in | GET `q=` (Nominatim search, `countrycodes=us`, 6 results) · GET `lat=&lon=` (reverse, zoom 18; 404 `no_match`) | No cache, no throttle; UA carries the admin's email. **Autocomplete violates Nominatim's policy.** |
| `images.php` | GET `sublet_id`: any signed-in user (**no visibility/ownership check**) · POST `delete/set_cover/move`: owner or admin · everything else admin | `_method=DELETE id` (409 if last photo) · `set_cover id` · `move id dir` · `bulk_delete ids[]` · `delete_orphans names[] confirm=<count>` · `make_thumbs skip[]` · GET `action=inventory\|orphans` | Every change renumbers 0..n-1 and re-syncs the cover. |
| `posts.php` | admin, same-origin | `delete id` · `delete_user username` · `set_status id status` | `delete` sends an admin notice; the other two do not. Share cards in `public/share/` are left behind. |
| `semesters.php` | admin, same-origin | `add code name` · `toggle id` (409 if archived) · `delete id` (409 if any listing runs for it) | No format check on `code`. |
| `archive.php` | admin, same-origin | GET `preview&code` · POST `archive code confirm` (confirm = code; 300 s; lock file) · POST `delete_tarball name` | Tarball to a home-directory backup folder, verified with `tar -tvzf`, one DB transaction, then file deletes. |
| `announcement.php` | GET anyone signed in · POST admin | `save message style` · `clear` | Writes the git-tracked `data/announcement.json`. Failures return 200 `{success:false}`. |
| `email.php` | admin, same-origin | `type=all\|semester\|individual, subject, body, semester?, recipients?` | One `mail()` per recipient to `{netid}@uvm.edu` (never `contact_email`), plus a copy to the admin. `all` = posters of public listings only. |
| `allowlist.php` | admin, same-origin | `add uid kind note` · `remove id` · `rebuild` | Rewrites `app/.htaccess`, self-tests over HTTP, rolls back. **Obsolete after the move.** |

### 1.3 Forms

**Post form** (`app/post.php`). Field names are aliased to defeat Safari AutoFill (`search_who/place/reach/text` → `display_name/address/contact_email/contact_phone`); the new app needs the same trick (see 4, "Post").

| Field | Column | Legacy server rule | Gap |
|---|---|---|---|
| `price` | `price` decimal(10,2) | **none** (HTML `required min=0 step=0.01`) | raw string stored |
| `price_negotiable` | bool | 0/1 | |
| address (`search_place`) | `address` varchar(255) | trimmed only | no length check |
| `lat`, `lon` | numeric(10,6) | cast to float; both 0 → error; >50 mi from campus (44.477435, −73.195323) → error | |
| `semesters[]` | `sublet_semesters` + `sublets.semester` = first | at least one; every code offered; back-to-back by name (Spring→Summer→Fall→next Spring) | |
| `description` | text | none | no length check; max seen 1,777 chars |
| contact email (`search_reach`) | varchar(100) | trimmed only | **no email validation** |
| phone (`search_text`) | varchar(20) | trimmed only | |
| name shown (`search_who`) | `display_name` varchar(60) | `mb_substr(…,0,60)`; blank = show NetID | |
| `utility_electric/gas/water/internet` | varchar(20) | **none** (UI offers `''`, `landlord`, `tenant`) | any string stored |
| `utility_cost` | decimal(8,2) | float or NULL | no minimum |
| 8 `amenity_*` | bool | isset | |
| `bedrooms`, `roommates` | tinyint | 0..20 or NULL | |
| `bathrooms` | decimal(3,1) | nearest 0.5, 0.5..9.5, or NULL | |
| `roommate_gender` | varchar(20) | `''`, women, men, nonbinary, mixed; forced `''` when roommates = 0 | |
| `roommate_preference` | varchar(20) | `''`, women_nonbinary, men_nonbinary, women, men, nonbinary; forced `''` when roommates = 0 | |
| `images[]` | files | bytes-sniffed type (jpg/png/gif/webp/bmp; HEIC detected and refused); ≤20 files, ≤30 MB each, ≤120 MB/request; required on create | **no cap on total photos per listing** (one listing has 19) |
| `action=status`, `status=open\|paused\|taken` | `status`, `status_changed_at` | own listing; 303 back | |
| `action=delete` | — | deletes files + row (cascades); admin notice; 302 | falls through to save when the user has no listing |

**Admin forms** are described per tab in 1.1 and 4. **Recover** has one form (`action=restore name=<backup>`).

### 1.4 Database (from the dump, 8 Oct 2026)

| Table | Rows | Key columns | Notes |
|---|---|---|---|
| `sublets` | 43 | `id` PK (AUTO_INCREMENT at 220), `username` **UNIQUE** (the NetID; all `[a-z0-9]{4,8}`), `image_url`, `thumbnail_url`, `price`, `price_negotiable`, `address`, `semester` (first), `bedrooms`, `bathrooms`, `roommates`, `roommate_gender`, `roommate_preference`, `lat`, `lon`, `description`, `posted_at`, `display_name`, `contact_email`, `contact_phone`, `utility_*` ×4, `utility_cost`, `amenity_*` ×8, `status` (indexed), `status_changed_at` | All 43 `open`. 40 spring27, 3 summer27. 22 have an empty `display_name`. 39 contact emails are `netid@uvm.edu` (the form's default); 4 are not. 32 have a phone. **No `updated_at` column.** |
| `sublet_images` | 196 | `id` (AUTO_INCREMENT at 645), `sublet_id` FK cascade, `image_url` (`./public/images/<32hex>.<ext>`), `sort_order` | 1–19 per listing; ext jpg 123 / png 28 / webp 23 / jpeg 22. All names random. **2 of 43 listings have a minimum `sort_order` that is not 0** — "first", not "0", is the cover. |
| `sublet_semesters` | 44 | PK (`sublet_id`, `semester_code`), FK cascade | spring27 40, summer27 3, fall27 1. Every code maps to a `semesters` row. |
| `semesters` | 4 | `code` UNIQUE, `name`, `active`, `sort_order`, `archived_at` | spring27, summer27, fall27, spring28; all active. **The two archived semesters (summer26, fall26) have no row any more.** |
| `semester_archives` | 2 | `semester_code` UNIQUE, totals, `tarball` | summer26 (11 listings), fall26 (1). |
| `listing_events` | 209 | `id` bigint (AUTO_INCREMENT at 607), `listing_id` (no FK), `poster_username` (**written, never read**), `actor_key` char(16), `semester`, `type`, `source`, `target`, `dedupe_key` UNIQUE, `created_at` | **Not migrated** (decided: the log starts fresh at cutover; `semester_archives` keeps the historic totals). |
| `allowed_users` | 11 | `uid` UNIQUE, `kind` allow/block, `note`, `added_by`, `added_at` | All `allow`; only 1 of the 11 has a listing; 6 have notes (PII). **Not migrated.** |

**Timestamps.** The live database stores `TIMESTAMP` columns in UTC and shows them in Eastern (`time_zone = SYSTEM`). The dump was exported by phpMyAdmin with `SET time_zone = "+00:00"` (line 12), so **every timestamp in the dump is UTC** (the event-hour histogram peaks at 21:00 UTC, i.e. 5 pm Eastern). Read with the session pinned to UTC and convert nothing. Collation `utf8mb4_0900_ai_ci`.

### 1.5 Scheduled jobs

**None.** No cron, no crontab, no worker. Everything time-based is request-driven: the 60/min event rate limit, per-day dedupe keys, the 30-day activity range, `LISTING_EVENTS_SINCE = 2026-10-02`, "posted N days ago". Cleanup is admin-triggered (archive, orphan sweep, thumbnail backfill, `.htaccess` backup pruning to 10). Listings never expire; the move notice never expires either (hard-coded "October 15, 2026").

### 1.6 Storage and files outside the tree

| Path | Contents | Migrate? |
|---|---|---|
| `public/images/<32hex>.<ext>`, `<stem>_display.webp`, `<stem>_thumb.webp` | 196 originals (≤3000 px, ICC only) + siblings | **Originals only**; derived images are regenerated (3.4) |
| `public/share/<id>-<og\|story>-<md5>.jpg` | share-card cache | No (regenerated) |
| `data/announcement.json` | banner (`active=false` today) | Nothing to migrate |
| `app/.htaccess` (tracked, lists ~11 NetIDs), `recover/`, the home-directory `.htaccess` backups | CAS allowlist machinery | No |
| Home-directory backups on Silk: `semester-*.tar.gz`, pre-backfill originals (`{netid}_…` names), `rename-journal.json`, `heic-repair-*/` (**contains GPS-tagged HEICs**) | archive tarballs and one-off backups of listings already removed from the site | **No** (decided: manifest only, no archive copy of photos). Delete at decommission. |
| A scripts folder in the Silk home directory | one-off PHP/Python scripts | No |
| `.env` in the Silk home directory | `DBNAME`, `DBUSER`, `DBPASS`, `GOOGLE_API` (**never read by code**), maybe `SHARE_SECRET` | Used once by the migration script, locally (2.5); never copied to Vercel |

### 1.7 External services and client-side dependencies

Server: Nominatim (search + reverse, UA `UVMSublets/1.0 (<admin's UVM address>)`), PHP `mail()` through UVM's relay (notices from/to the admin's UVM address; broadcasts to `{netid}@uvm.edu`), ImageMagick `convert`, GD, `tar`, a curl self-test of `/app/` expecting a 302 to `idp.uvm.edu`.
Browser: cdnjs Leaflet 1.9.4, MapLibre GL 5.24.0, noUiSlider 15.6.1 (all SRI-pinned), vendored `leaflet-maplibre-gl.js` 0.1.4, a Font Awesome kit (no SRI), OpenFreeMap style `tiles.openfreemap.org/styles/positron`, Esri World Light Gray tiles (fallback), `twitter.com/intent/tweet`, `mailto:`/`sms:`/`tel:`, Apple/Google Maps links.

### 1.8 Where CAS identity (the NetID) is used

| Use | Where | New equivalent |
|---|---|---|
| Source of identity | `get_current_user_id()` reads `$_SERVER['REMOTE_USER']` (`includes/auth.php:17`) | `auth.api.getSession()` → `session.user` |
| Admin check | `is_admin()` = `REMOTE_USER === ADMIN_UID`; `require_admin()`; `data-admin`; modal Delete button; Admin nav | `user.role = 'admin'` (admin plugin) |
| Ownership key | `sublets.username` UNIQUE; `WHERE username = ?` on lookup, **update** and delete (`post.php:34,278`) | `listings.user_id` UNIQUE, `WHERE id = ? AND user_id = ?` |
| Photo permission | `photo_with_owner()`: admin OR `REMOTE_USER === sublets.username` (`image_admin.php:90`) | same, by `user_id` |
| Client-side "is this mine" | cards' `data-username`, `MAP_SUBLETS.username` vs `body[data-user]` → Edit vs Email/Call | server decides; the DTO carries `isMine: boolean`, never the owner's id |
| Default contact email | `{netid}@uvm.edu` on the post form and as the mailto fallback (`post.php:940`, `app.js:741`) | the account email |
| Broadcast recipients | `{netid}@uvm.edu`, ignoring `contact_email` (`email.php:106`) | `user.email` |
| Display name fallback | `poster_name()` shows the NetID when `display_name` is blank | the local part of the account email, which equals the NetID for every migrated user (2.4) |
| Analytics | `actor_key = HMAC('actor:'+netid)[0:16]`; admin excluded; poster excluded for non-share types (`events.php:76-116`) | `HMAC('actor:' + user.id)` under `APP_SECRET`; the log starts empty |
| Audit columns | `allowed_users.added_by`, `semester_archives.archived_by`, `listing_events.poster_username` (never read) | all dropped |
| Access control list | `allowed_users` → `Require ldap-filter` with explicit uids | allowed-domain config + admin-plugin ban + `ALLOWED_EMAILS` exceptions |
| Hard-coded literals | `admin.php:783`, `notify.php:23`, `broadcast_email.php:29`, `email.php:117`, `geocode.php:18`, `recover/.htaccess` | `SUPPORT_EMAIL` / `ADMIN_NOTICE_TO` config |
| Wording | "Sign in with your UVM NetID", "signed-in UVM students", "shows the NetID", "Everyone here signs in with a UVM NetID", "fellow Catamounts" (`landing.php:131,599-601`, `s.php:261`, `share.php:184`, `app.js:782`, `post.php:711,932,954`, `admin.php:812,863,900,947`) | rewrite (Phase 8 copy list) |

### 1.9 Ambiguities and surprises (resolved where a decision was made)

1. **`SHARE_SECRET` may not be set.** `share_secret()` falls back to `DBPASS`. The migration script determines which is in use empirically (2.5). Decided.
2. **Nothing in the dump says when a listing was last edited.** `sublets` has `posted_at` only, so every migration run is a full re-upsert (3.5).
3. **`min_bedrooms` filter** exists in SQL with no UI control. Dead; not ported.
4. **`GOOGLE_API`** in `.env` and the README is never read. Dead.
5. **`api/images.php?sublet_id=N`** lists photo URLs of hidden/paused/taken listings to any signed-in user. Fixed in the port.
6. **`MAP_SUBLETS` is `SELECT s.*`** — every column of every visible listing, NetIDs included. The new map sends an explicit DTO.
7. **Server-side validation gaps** (price, email, utilities, lengths). zod closes them; the migration script tolerates what is already stored.
8. **One listing per user** is enforced by `UNIQUE(username)` and app logic. Ported as `UNIQUE(user_id)`, updates by id.
9. **Deleting a listing** leaves its `listing_events` rows and `public/share/` cards. Decided: events are deleted with the listing (FK cascade); cards are not cached on disk any more.
10. **`listing_events.poster_username`** is written and never read. Dropped.
11. **The move notice** is already live on every page with the 15 October opt-out date and a plain-text contact address. The email with the same date went out. Both deadlines are honoured after the fact (6.1).
12. **Admin notices are incomplete** in the legacy. The port sends one for every change.
13. **`og:image:type` says JPEG** while the fallback cards are PNG; a bad slug on `share-card.php` returns an empty 404. Fixed in the port.
14. **Two app-written files are git-tracked** (`app/.htaccess`, `data/announcement.json`), and the tracked `.htaccess` lists ~11 real NetIDs in a public repo. The Silk shim removes that file (6.4).
15. **Possible reflected XSS** in the legacy (`header.php:98`, `data-page` unescaped). Behind CAS and about to be retired; not fixed.
16. **Every date rule is Eastern** — dedupe keys, `posted_ago()`, the daily chart's buckets. Vercel runs UTC, so these helpers pin `America/New_York` explicitly.
17. **UVM mailboxes answer to two addresses**, `netid@uvm.edu` and `First.Last@uvm.edu`. Migrated accounts are keyed on the NetID form; the sign-in rule rejects a dotted local part (2.4).

---

## 2. Data model

### 2.1 Principles

- **Listing ids are preserved** (`listings.id` = `sublets.id`), as are photo ids. Share slugs `/s/187-<token>` and old deep links key on them. Identity columns are `GENERATED BY DEFAULT AS IDENTITY`; after import the sequences are set to the legacy `AUTO_INCREMENT` values (220, 645) rather than `max+1`, so a deleted id is never reused.
- **Timestamps are `timestamptz`.** The source is UTC (1.4); nothing is converted.
- **No denormalised cover columns.** The cover is the photo with the lowest (`sort_order`, `id`); the Browse query loads every photo of every visible listing in one query (as `listing_photos()` does today) and takes the first.
- **No "first semester" column.** `listing_semesters.position` (0..n, written in calendar order by the one function that writes the table) replaces `sublets.semester`; "first" is `position = 0`.
- **Foreign keys where the data allows them.** `listing_semesters.semester_code → semesters(code) ON DELETE RESTRICT`; `listing_events.listing_id → listings(id) ON DELETE CASCADE` (decided: events go with the listing); `semester_archives.semester_code` has **no** FK (the archived semesters' rows are gone from `semesters`).
- **Vocabularies are `text` + `CHECK`**, not Postgres enums. The CHECK lists are generated from the same TypeScript constants the zod schemas use.
- **`lat`/`lon` are `double precision`** with range CHECKs. Keep the `LEAST(1, …)` guard inside `acos`.
- **better-auth owns its tables.** Generate them with the CLI; add app columns through `user.additionalFields`; `role` and bans come from the admin plugin.
- **Email is stored lowercase**, `CHECK (email = lower(email))`, unique index. No `citext`.
- **`(listing_id, sort_order)` is not unique.** Reordering renumbers 0..n−1 in a transaction; reads order by (`sort_order`, `id`).

### 2.2 Postgres schema (Drizzle; shown as DDL for review)

```sql
-- better-auth (generated), extended:
user            id text pk, email text not null, email_verified boolean not null default false,
                name text not null,                                   -- required by better-auth; not shown publicly
                image text, created_at timestamptz, updated_at timestamptz,
                role text not null default 'user', banned boolean, ban_reason text, ban_expires timestamptz,  -- admin plugin
                legacy_netid text unique,                             -- 'jsmith' …; null for post-move signups
                last_login_at timestamptz
                unique index (lower(email)); check (email = lower(email))
session, account, verification, rate_limit                            -- as generated

semesters       code text pk, name text not null, active boolean not null default true,
                sort_order int not null default 0, archived_at timestamptz, created_at timestamptz

listings        id integer generated by default as identity pk,
                user_id text not null unique references user on delete cascade,   -- one listing per account
                price numeric(10,2) not null check (price >= 0),
                price_negotiable boolean not null default false,
                address text not null check (length(address) <= 255),
                lat double precision not null check (lat between -90 and 90),
                lon double precision not null check (lon between -180 and 180),
                bedrooms smallint check (bedrooms between 0 and 20),
                bathrooms numeric(3,1) check (bathrooms between 0.5 and 9.5),
                roommates smallint check (roommates between 0 and 20),
                roommate_gender text not null default '' check (…), roommate_preference text not null default '' check (…),
                description text check (length(description) <= 4000),
                display_name text not null default '' check (length(display_name) <= 60),   -- the public name, as today
                contact_email text, contact_phone text,
                utility_electric text not null default '' check (in ('', 'landlord', 'tenant')), utility_gas …, utility_water …, utility_internet …,
                utility_cost numeric(8,2) check (utility_cost >= 0),
                amenity_free_parking boolean not null default false, … (8 flags) …,
                status text not null default 'open' check (status in ('open','paused','taken')),
                status_changed_at timestamptz,
                legacy_share_token char(10),                            -- see 2.5; null for new listings
                legacy_import boolean not null default false,          -- marks migrated rows for --prune
                posted_at timestamptz not null default now(), updated_at timestamptz not null default now()
                index (status)

listing_semesters  listing_id int references listings on delete cascade, semester_code text references semesters(code) on delete restrict,
                   position smallint not null,                          -- 0 = first; calendar order
                   pk (listing_id, semester_code), unique (listing_id, position), index (semester_code)

listing_photos  id integer generated by default as identity pk, listing_id int references listings on delete cascade,
                sort_order int not null,
                stem text not null unique,                             -- the 32-hex name
                original_url text not null, display_url text not null, thumb_url text not null, card_url text not null,
                width int, height int, bytes int, content_type text, sha256 char(64) not null, created_at timestamptz
                index (listing_id, sort_order, id)

listing_events  id bigint generated by default as identity pk,
                listing_id int not null references listings on delete cascade,   -- decided: deleted with the listing
                actor_key char(16) not null, semester_code text,
                type text not null check (…), source text check (…), target text check (…),
                dedupe_key text unique, created_at timestamptz not null default now()
                index (listing_id, type, created_at), index (actor_key, created_at), index (semester_code), index (created_at)

semester_archives  id serial pk, semester_code text unique, semester_name text, archived_at timestamptz,
                listings int, taken int, price_median numeric, price_min numeric, price_max numeric,
                views int, contacts int, shares int, share_arrivals int, photos int, bytes bigint,
                manifest jsonb                                          -- listing ids → photo stems and sizes; no PII

site_settings   key text pk, value jsonb not null, updated_at timestamptz, updated_by_user_id text
                -- rows: 'announcement' {active, message, style}; 'read_only' {active, message}; 'launched' {at}
```

### 2.3 Column mapping, legacy → new

| Legacy | New | Transform |
|---|---|---|
| `sublets.username` | `user.legacy_netid`; `user.email`; `listings.user_id` | one user per distinct username; `email = username + '@uvm.edu'` **except** the legacy admin's NetID, which maps to the admin address (`LEGACY_EMAIL_OVERRIDES` in the script; decided); `email_verified = false` until the first code; `user.name = display_name || username` (required, not shown) |
| `sublets.display_name` | `listings.display_name` | as-is |
| `sublets.id` | `listings.id` | kept; `legacy_import = true` |
| `sublets.image_url`, `thumbnail_url` | — | dropped; cover = first photo |
| `sublets.semester` | `listing_semesters.position = 0` | the import orders a listing's codes by `semesterKey()` and numbers them |
| `sublets.posted_at`, `status_changed_at` | same, `timestamptz` | **read as UTC, no conversion** |
| — | `listings.updated_at` | = `posted_at` at import |
| — | `listings.legacy_share_token` | computed during import (2.5) |
| `sublets.contact_email` | same | lowercase; stored as-is even when not a valid email |
| `sublets.price`, `bathrooms`, `utility_cost` | numeric | as-is |
| `sublets.lat`, `lon` | double precision | as-is |
| `sublets.bedrooms`, `roommates` | smallint | as-is (NULL stays NULL) |
| `sublet_images.image_url` | `listing_photos.stem` + four URLs + `sha256`, `width`, `height`, `bytes` | `./public/images/<stem>.<ext>` → stem; files from the upload step (3.4) |
| `sublet_images.sort_order` | `listing_photos.sort_order` | renumber 0..n−1 by (`sort_order`, `id`) |
| `sublet_semesters` | `listing_semesters` | as-is plus `position` |
| `semesters` | `semesters` | as-is (`code` becomes the PK; `id` dropped) |
| `semester_archives.*` | same minus `archived_by`, `tarball` | `manifest = {legacy_tarball: "<name>"}` for the two rows |
| `listing_events` | — | **not migrated** (decided) |
| `allowed_users` | — | not migrated |
| `data/announcement.json` | `site_settings['announcement']` | inactive today; nothing to carry |

### 2.4 Accounts: how a NetID becomes an email account

- Every distinct `sublets.username` becomes a `user` with `email = <netid>@uvm.edu` (override: the legacy admin's NetID → the admin address, role `admin`), `legacy_netid = <netid>`, `email_verified = false`.
- Sign-in is by email code. When a migrated user requests a code for their NetID address, better-auth finds the existing user (lowercased lookup) and signs them in; on success `email_verified` flips to true. Their listing is already attached, so **existing users keep ownership without any action beyond signing in**.
- **NetID form only.** The sign-in form rejects a local part containing a dot with "Use your NetID address — it looks like jsmith@uvm.edu, not jane.smith@uvm.edu". The welcome email and the sign-in page say the same. One person = one account, and the display fallback (email local part) equals the NetID.
- A student with no legacy listing signs in the same way; the account is created on the first successful code.
- Opt-outs (6.1): NetIDs or emails in `opt-outs.txt` (gitignored, one per line) are excluded by the migration script; anyone who opts out after the migration is removed with `npm run delete-user -- <email>` (3.6).

### 2.5 Secrets and share tokens

- Legacy: `share_token(id) = hmac_sha256(SECRET, 'sublet:'+id)[0:10]`, `SECRET = SHARE_SECRET ?? DBPASS`.
- **The legacy secret never enters Vercel.** The migration script (running locally, with the legacy `.env` values at hand) computes `legacy_share_token` for each listing and stores it on the row. `parseShareSlug()` verifies an incoming token with a constant-time compare against the new token (issued under `APP_SECRET`) or, failing that, against `legacy_share_token`. Links already in stories and group chats keep working through the redirect (6.4).
- **Which secret is in use is determined empirically** (decided): the script computes the token for one listing under both candidates and compares with the `data-share-url` the legacy Browse page emits for that listing (you paste one share URL from the live site into the script's config).
- Actor keys: `hmac(APP_SECRET, 'actor:' + user.id)`. The log starts empty at cutover, so there is no continuity question.
- `APP_SECRET` is 32 random bytes, generated once, set in Vercel, validated by `env.ts`.

### 2.6 Photos in Vercel Blob

- **Two stores.** `uploads` (private; `BLOB_UPLOADS_READ_WRITE_TOKEN`) receives raw client uploads at `raw/<userId>/<random>`; `media` (public; `BLOB_MEDIA_READ_WRITE_TOKEN`) holds only processed output at `listings/<listingId>/<stem>_display.webp`, `<stem>_thumb.webp`, `<stem>_card.jpg`. **No original is stored** (revised 8 Oct for the Hobby plan's Blob caps: ~300 KB per photo instead of ~1 MB). The raw file is deleted after processing; a daily cron sweeps anything older than a day. The admin Images tab shows stored bytes and an estimate of the month's writes against the caps. **Fallback, not built:** if a Blob cap is ever approached, the public store moves to Cloudflare R2 (free: 10 GB, 10 M reads a month, no egress), a driver in `src/server/storage/index.ts` plus a CSP host.
- **Pathnames are deterministic** (the stem is 128 random bits, so `addRandomSuffix: false`) — but the server, not the client, chooses them. `allowOverwrite` stays false in app code. Files are never rewritten in place, so URLs are immutable and need no cache-busting.
- Processing (sharp, Node runtime, `maxDuration: 60`, one photo per invocation; the client calls a Server Action after each upload rather than relying on `onUploadCompleted`, which does not fire locally): sniff bytes with `file-type` (jpeg/png/gif/webp only; HEIC detected by its `ftyp` box and refused) → `.rotate()` → resize to ≤3000 px long edge → `.keepIccProfile()` (sharp strips EXIF, GPS and XMP by default) → original in its own format; then display WebP ≤1600 px q80, thumb WebP 600 px wide q80, card JPEG ≤1200 px q85. Record `width`, `height`, `bytes`, `sha256`.
- **Cap: 25 photos per listing** (decided).
- HEIC: sharp's prebuilt libvips has no HEVC decoder, so the browser-side canvas conversion (Safari) is kept and `heic2any` (libheif WASM) is added so Chrome and Android convert too.

---

## 3. Data migration

### 3.1 Inputs

1. **Source rows.** Preferred: read the live MySQL through an SSH tunnel via the Silk host (`ssh -L 3306:<legacy MySQL host>:3306 <silk>`), session pinned with `SET time_zone = '+00:00'` and mysql2 `timezone: 'Z'`. Fallback: a `mysqldump` on Silk loaded into a local MySQL (no Docker on this machine, so the fallback needs one installed or a dump reader that is **not** hand-written — descriptions contain newlines, quotes and backslash escapes). The 8 Oct dump, kept in the private working folder, is the rehearsal input until you approve a live read.
2. **Originals**: `rsync -av <user>@<silk>:<docroot>/public/images/ ./legacy-images/ --exclude='*_display.webp' --exclude='*_thumb.webp'` (196 files).
3. `opt-outs.txt`: NetIDs or emails, one per line (gitignored).
4. The legacy `.env` values (`SHARE_SECRET`/`DBPASS`) plus one live share URL, for 2.5, passed as env vars to the script.
5. Target env: `DATABASE_URL` (a Neon branch for rehearsal, `main` for the real run), both Blob tokens.

Everything lives in a private working folder outside every git checkout. It is PII.

### 3.2 Script: `scripts/migrate-legacy/` (TypeScript, `npm run migrate:legacy -- <flags>`)

| Flag | Does |
|---|---|
| `--dry-run` (default) | reads both sides, prints the per-table plan (insert / update / unchanged / would-delete counts) and the verification report; writes nothing |
| `--apply` | upserts rows in dependency order inside one transaction: `semesters` → `user` → `listings` → `listing_semesters` → `listing_photos` (rows) → `semester_archives` → `site_settings`; then `setval`s the identity sequences to the legacy `AUTO_INCREMENT` values |
| `--images` | for every `listing_photos` row: run the 2.6 pipeline on the local original, upload the four outputs to the `media` store (skip when `head()` reports the same size **and** the stored `sha256` matches), write URLs and dimensions onto the row; 4 in parallel; resumable |
| `--prune` | deletes target rows with `legacy_import = true` (or `legacy_netid` set) whose legacy key is absent from the source, cascading photos (DB) and their Blob files (explicit `del`); prunes users whose listing vanished and who have never signed in. **Refuses to run if the target shows post-cutover life** (any `session` row, any listing without the marker). Only with `--apply` |
| `--opt-outs opt-outs.txt` | removes those people as posters (user, listing, photos, semesters) before planning; persists a hash of the list so every later run applies the same exclusions |
| `--verify` | the checks in 3.3; exits non-zero on any mismatch |

Idempotency: every table is upserted on its legacy key with `ON CONFLICT DO UPDATE` of **every** migrated column, and child sets are diffed per listing. A re-run after the final read overwrites edits made on Silk in between. Nothing on the new side is written by users until the gate opens.

Ordering: `semesters` first (FK from `listing_semesters`; a code with no row gets an inactive `semesters` row and a report line), `user` before `listings`, `listings` before its children. Duplicate `sort_order` values are renumbered by (`sort_order`, `id`). A row whose original file is missing from `legacy-images/` is reported and imported with empty URLs so the admin Images tab shows it as missing. Orphan files are listed, not migrated.

### 3.3 Verification (`--verify`, also printed by `--dry-run`)

- Row counts per table, source vs target, after exclusions.
- **Every row**: a canonical JSON of each listing (30 columns, numbers as fixed-point strings, timestamps as UTC epoch seconds, trimmed text) and each photo, compared between source and target; differing ids listed; expected empty.
- A timezone sentinel: one listing's `posted_at` compared against a known Eastern wall-clock time you supply (e.g. the launch evening).
- Per-listing photo counts; cover (lowest `sort_order`, `id`) equals the legacy `sublets.image_url` stem for every listing.
- `listing_semesters` pair-set equality and `position = 0` equals the legacy `sublets.semester`; `semester_archives` totals equality.
- `user`: count = distinct usernames − exclusions; every `listings.user_id` resolves; every email passes `assertEmailAllowed`.
- Share tokens: every listing's legacy slug round-trips through the new resolver.
- **Images by hash**: download each `original_url` and compare `sha256` with the local file; `HEAD` the three derived URLs for 200 and the recorded sizes; and the reverse — every blob under `listings/` in the `media` store has a row.
- Sums: total bytes; `SUM(price)`; `COUNT` per status.

### 3.4 Images

Originals are copied byte-for-byte (already ≤3000 px, ICC-only, EXIF-stripped); display, thumb and card variants are **regenerated by sharp** so one pipeline produces every derived image, `width/height/bytes` are exact, and the JPEG card variant exists for every photo. Blob pathnames are deterministic, so a re-run is a no-op for files already present and verified.

### 3.5 Rehearsal and the final sync

Because `sublets` has no `updated_at`, the final sync is a **full re-run**. Sequence: rehearsal #1 on a Neon branch from the 8 Oct dump → fix the script → rehearsal #2 on `main` with the real Blob stores (testers use this) → on the day: freeze → read the frozen source → `--dry-run --prune` → Neon branch of `main` as the restore point → `--apply --images --prune` → `--verify`. The dry run against the frozen data is the gate.

### 3.6 `delete-user` (decided)

`npm run delete-user -- <email-or-netid>` in `scripts/admin/delete-user.ts`. Dry-run by default: resolves the user, prints what would go (user id, listing id, photo count and Blob paths, event count, session count) and exits. `--apply` deletes in one transaction (user → listing → photos → events → sessions, the last two by cascade), then deletes the Blob files, and appends one line per run to a deletions log outside the repo (timestamp, identifier, counts — no other PII). Running it against production is a production write and a deletion: it is run only on your explicit go-ahead, one person at a time. It is also what honours opt-outs that arrive after the migration (6.1).

---

## 4. Feature parity checklist

Legend: **Keep** = port as-is · **Change** = port with the noted difference · **Drop** = not ported, with the reason · **New** = did not exist.

| Area | Legacy feature | Next.js equivalent | Status |
|---|---|---|---|
| **Public** | Landing page: hero, board of 12 thumbnails, count, semester phrase, CTA | `app/(public)/page.tsx`, Server Component, revalidate 60 s; same board from `listing_photos` thumbs | Change: new copy, palette, mark; no UVM wording, no "fellow Catamounts" |
| | og/twitter tags on landing; `og:image` static graphic | `generateMetadata`; new `public/og-default.png` | Change: redrawn graphic |
| | Move notice modal | Not needed after launch | Drop |
| | `/demo` 302 | On the Silk shim only | Drop |
| | `robots.txt`: disallow `/s/`, share cards, app, images | `app/robots.ts` with the same intent | Keep |
| | Security headers: nosniff, Referrer-Policy, X-Frame-Options | `next.config` headers + a CSP with nonces (5.8) | Change: stronger |
| | Static asset caching with `?v=mtime` | Next.js hashed assets; immutable Blob URLs | Keep (free) |
| **Share** | `/s/<id>-<token>`: open / taken / unavailable states, no id oracle, `noindex`, sign-in handoff | `app/(public)/s/[slug]/page.tsx`; handoff to `/sign-in?next=/browse?id=N&via=share` | Keep |
| | `share_card_lines()` as the one public boundary (price, negotiable, semester, size, distance) | `lib/share.ts shareCardLines()` used by both the page and the image | Keep |
| | Share card og 1200×630 / story 1080×1920, near-square photo panel, cache, fallbacks, never 500 | `app/share-card/[slug]/[format]/route.tsx` with `ImageResponse` from the cover's `card_url`; Bricolage TTFs from `assets/fonts/`; `Cache-Control: public, max-age=86400, s-maxage=86400`; fingerprint in `?v=`; fallback to the static graphic on any throw, bad slug included | Change: PNG output; `og:image:type` set correctly |
| | Share sheet: native / Instagram / Snapchat / Text / Email / X tiles, Copy; story image fetched as a file and handed to `navigator.share`, download fallback; tracking | `components/ShareSheet.tsx`; story image URL = the share-card route; file name `catamount-sublet-story.png` | Keep |
| | `share_url` built server-side | listing DTO carries `shareUrl` | Keep |
| | Old links keep working | stored legacy tokens (2.5) + Silk redirect (6.4) | New |
| **Auth** | CAS; LDAP student filter + uid allowlist; `/recover/` | Email code (0.3); domain config; NetID-form rule; admin-plugin bans; sign-in page with "check Junk / resend in 60 s"; sign-out | Change |
| | Admin = `ADMIN_UID` | `user.role` | Change |
| | `require_same_origin()` on every POST | Server Actions (Next.js checks Origin/Host) + an explicit `Sec-Fetch-Site`/Origin check in every mutating Route Handler; better-auth `trustedOrigins` | Keep |
| **Browse** | Filters: price range, semester, roommate preference, distance, 6 amenity chips, negotiable; count badge; Clear; phone filter sheet | `app/(app)/browse/page.tsx` reads `searchParams`; `FilterBar` client component; range inputs (no noUiSlider) | Keep |
| | Live update (debounced fetch, abort stale, swap grid+heading, `replaceState`, fallback to navigation) | `router.replace(url)` in a `useTransition`; server re-renders the grid; pending state on the body | Keep |
| | Untouched sliders are not filters; `count` for the badge | `buildListingFilters()` returns `count` | Keep |
| | Sort: newest/oldest/price ↑↓/closest; client-side reorder | same | Keep |
| | `data-carry-filters` links | nav links built from current search params | Keep |
| | `?id=` deep link: drop filters, open the view, "isn't up any more" notice; `via=share` → `share_arrival` source | same | Keep |
| | Cards: cover, price tab, semester badge, address, facts, tags with "+N more" fitting, preload first photo on pointerdown, broken-image retry | `ListingCard`; tag fitting with `ResizeObserver`; `onError` retry once | Keep |
| | No pagination | none (43 listings); `LIMIT 200` guard | Keep |
| | Empty state "Yours will be the first" (wrong when all are paused/taken) | branch on whether any listing exists | Change |
| **Map** | Same filters via form submit; `MAP_SUBLETS` = whole rows | `app/(app)/map/page.tsx`; filters live like Browse; an explicit `MapListing` DTO | Change |
| | Price-tag pins grouped at 4 dp, lowest price + count, active pin, popup, "N listings here", `fitBounds` incl. campus, campus marker, imperial scale, empty state | MapLibre `Marker` with the same HTML; popups as a React portal; active = maple | Keep |
| | OpenFreeMap vector style recoloured by source-layer; Esri raster fallback; campus wash | same; campus wash sand, not gold | Keep |
| | `map_pin_open` per listing in a group | same | Keep |
| **Listing view** | Opens with `pushState`, Back closes; focus trap; Escape; swipe; arrows/dots/counter/keyboard; neighbours preloaded; thumb under photo with fade; broken-image handling | A client-state view opened from a card or a pin with the same `pushState` / `popstate` contract (the data is already on the page); `/listing/[id]` is a real route that redirects to `/browse?id=` so direct links and the old `?id=` form work | Keep |
| | Facts line, Apple vs Google Maps link by UA, description, place/roommates block, utilities/amenities grid, poster line (Eastern dates) | `ListingView`; `postedAgo()` pinned to `America/New_York` | Keep |
| | Owner sees Edit, not Email/Call; phone bottom bar | server-side `isMine` | Keep |
| | Email panel: To, subject, editable draft, mailto, copy; Phone panel: copy, Call, Text; tracking | same; contact fields fetched by a Server Action when the panel opens | Change (lazy contact fetch) |
| | Admin Delete in the view | same, role-gated | Keep |
| | Photos arrive with the listing; `api/images.php` fallback | DTO carries `photos[]`; no fallback endpoint | Change |
| **Post** | One listing per user; create vs edit by existence | Server Action `saveListing` keyed by `session.user.id`; `UNIQUE(user_id)` | Keep |
| | Every field in 1.3 with the legacy rules, plus real validation | zod `listingInput` shared by client and server | Change (stricter) |
| | Safari AutoFill defeat (field aliases) | field `name`s with "search" in them, mapped in the action | Keep |
| | Address combobox: ≥3 chars, 350 ms debounce, 6 suggestions, keyboard, validity rule, `textSource` rule | `AddressCombobox` on `/api/geocode?q=` → Photon with a Burlington bias; Nominatim reverse for pins | Change (provider) |
| | Map pin: tap/drag places pin, reverse lookup fills the field unless typed; phone layout | `PostMap` (MapLibre) | Keep |
| | Photos: accumulate, dedupe, cap, previews, ←★→, remove; saved photos move/cover/delete immediately; HEIC conversion; submit guards | client upload per file to the private store, then `attachPhoto` action; cap **25** per listing | Change (upload path) |
| | Semester pills, no-gap rule client + server; closed semesters shown ticked | `SemesterPicker` + `semestersBackToBack()` port with unit tests | Keep |
| | Status panel, 303 + banner; saving never changes status | `setMyListingStatus` action | Keep |
| | Delete with confirm; removes files and row | `deleteMyListing` action; Blob `del` of every photo file; events cascade | Keep |
| | Stats line (views/contacts/shares) | same, from the fresh log | Keep |
| | Share row after save | same | Keep |
| | Refill after a failed save | `useActionState` keeps values; photos already attached | Change (better) |
| | Admin notice email on create / edit (diff) / status / delete | Resend to `ADMIN_NOTICE_TO`; same four templates; also on admin status change, user deletion and photo changes | Keep |
| **Account** | — | `app/(app)/account`: first and last name (required of everyone since 8 Oct: new accounts give them on `/welcome` right after their first code; migrated accounts are asked once, prefilled from the legacy "name shown" where it looked like a full name; `listings.display_name` stays the public name on the listing), email (read-only), sign out everywhere, **Delete my account and listing** | New |
| **Admin** | Header stats | same; "disk" from `SUM(listing_photos.bytes)` | Keep |
| | Semesters: add/toggle/delete, post counts, Hidden/Archived labels | same | Keep |
| | Archive: preview, typed confirmation, tarball, transaction, lock, history, schema check | preview + typed confirmation + transaction kept; **manifest only, no tarball, no archive copy of photos** (decided); photos deleted from Blob after the commit; advisory lock | Change |
| | Announcement: style, message, preview, publish, clear; banner on every page | `site_settings` row; banner in the app layout | Keep |
| | Posts: table, status select, images link, delete | same | Keep |
| | Images: inventory, storage totals, backfill, filters, per-tile actions, bulk delete, orphans & missing | inventory from DB; orphans from both stores; no backfill button | Change |
| | Users: posts per user, delete all by user | **People** tab: name, email, role, last login, banned; ban/unban, delete account, delete listing | Change (absorbs Access) |
| | Email: all / semester / individual; `{name}`; admin copy; counts | Resend chunked sender; same audiences; copy to `SUPPORT_EMAIL` | Keep |
| | Activity: ranges, totals, conversion, daily chart, sources, targets, per-listing table | same; chart buckets by Eastern day; starts empty at cutover | Keep |
| | Access tab | **Drop** (CAS-specific) | Drop |
| **Events** | Beacon, whitelists, dedupe per Eastern day, 60/min, exclusions, `s.php` logs nothing | `POST /api/events` with the same rules; `INSERT … ON CONFLICT DO NOTHING` | Keep |
| **Ops** | `.user.ini` upload limits; no cron | Vercel Cron: daily sweep of `raw/` older than 1 day and expired `verification`/`rate_limit` rows | New |
| | Admin notices and broadcasts via `mail()` | Resend; bounce webhook logged | Change |
| | `notify_samples.php` preview script | `npm run email:dev` (react-email preview) | Change |
| | — | `site_settings['read_only']`: blocks every write action with a banner (soft open, maintenance) | New |
| | — | `delete-user` script (3.6) | New |

---

## 5. Security

### 5.1 One-time codes

- 6 digits, `expiresIn: 600` (10 min), `allowedAttempts: 3`, `storeOTP: 'hashed'`, `resendStrategy: 'rotate'`.
- **One function, two hooks.** `assertEmailAllowed(email)`: trim, lowercase, reject a dotted local part, require the domain in `ALLOWED_EMAIL_DOMAINS` or the address in `ALLOWED_EMAILS`. Called from (a) a better-auth `hooks.before` on the send-code and sign-in-with-code endpoints, so nothing is ever mailed to a disallowed address; (b) `databaseHooks.user.create.before`, so no row is created by any path. The rule is public, so stating it leaks nothing; account existence is not leaked because new and existing addresses get the identical flow.
- Rate limits, app-level and Postgres-backed (`RATE_LIMITS` in `src/server/rate-limit.ts`, tested on PGlite): no new code for an address within 60 s; 5 codes per address per hour; 30 codes per IP per 10 min; 15 verification attempts per address and 60 per IP per 10 min (each code also dies after 3 wrong guesses); 3 listing creations per person per day. better-auth's own per-IP counters remain as a backstop (40 sends, 80 verifies per 10 min). No WAF layer: Vercel Hobby.
- The email: the code in large type, "expires in 10 minutes", "if you didn't request this, ignore it", no links, a plain-text part.
- `sendVerificationOTP` is not awaited (timing), using `waitUntil`.

### 5.2 Sessions

- better-auth database sessions: cookie `__Secure-…session_token`, `httpOnly`, `Secure`, `SameSite=Lax`, `expiresIn: 30 days`, `updateAge: 1 day` (sliding), `cookieCache` 5 min.
- Banning or deleting an account revokes every session row; the cookie cache means up to 5 minutes of residual read access, accepted.
- Protected routes: the `(app)` layout calls `auth.api.getSession()` and redirects to `/sign-in?next=…`; `proxy.ts` does only an optimistic cookie-presence check.
- `trustedOrigins`: the production domain and the Vercel preview host pattern.

### 5.3 Authorisation

| Action | Who | Enforced where |
|---|---|---|
| Browse/Map/view listing/contact details/events | signed in, not banned | `(app)` layout + `requireUser()` in every action |
| Create/edit/status/delete own listing, attach/move/cover/delete own photos | owner | data-access functions take `userId` and filter `WHERE user_id = $1`; a 0-row update is a 404 |
| Photo list for a listing | owner, admin, or anyone signed in when the listing is public | `canSeeListing(user, listing)` |
| Delete any listing, set status, ban/delete user, semesters, announcement, broadcast, archive | admin | `requireAdmin()` at the top of every admin action and route |
| Upload token | signed in; pathname set by the server to `raw/<userId>/…` in the private store | `onBeforeGenerateToken` |
| Share page, share card, landing board | anyone | only `shareCardLines()` fields and thumbnails |

### 5.4 Cross-site requests

Server Actions are protected by Next.js's Origin check. Every mutating Route Handler (`/api/events`, `/api/upload`) checks `Sec-Fetch-Site ∈ {same-origin, none}` and falls back to Origin/Referer host == Host. The beacon endpoint also requires a session. `/api/geocode` is GET, session-gated and rate-limited.

### 5.5 Input validation (zod)

One schema module per domain, imported by the Server Action and by the client form: `listingInput`, `photoAction`, `statusInput`, `eventInput`, `geocodeQuery`, `announcementInput`, `broadcastInput`, `semesterInput`, `archiveInput`, `shareSlug`, `signInEmail` (the NetID-form rule). `env.ts` validates every environment variable at boot.

### 5.6 Uploads

- Client upload tokens only for signed-in users, into the private store, `allowedContentTypes` images only, `maximumSizeInBytes: 30 MB`, server-chosen pathname.
- The server never trusts the content type: `file-type` sniffs the bytes before sharp runs; sharp re-encodes everything.
- Metadata: everything stripped except ICC. GPS never reaches the public store.
- Public URLs are random; no listing of the store is exposed; `BLOB_*` tokens are server-only.

### 5.7 PII

- Stored: account email, contact email/phone, name shown, address, coordinates, description, photos. Shown to signed-in users only, except the share-card lines and thumbnails.
- Never logged: emails, codes, contact fields. `no-console` is an ESLint error in `src/`; logging goes through `src/server/log.ts`, which takes ids only.
- Pseudonymous analytics with the actor key derived from the user id; no poster id on events; events die with their listing.
- Deletion: self-service on the account page; admin from the People tab; the `delete-user` script for opt-outs.
- Retention: Neon point-in-time restore is the database backup; `raw/` uploads are swept after a day; the private migration folder is deleted after decommission.
- A privacy note (footer link, one page).

### 5.8 Headers

`next.config.ts` headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, a minimal `Permissions-Policy`, and a CSP with a per-request nonce (`script-src 'self' 'nonce-…'`, `img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://tiles.openfreemap.org https://server.arcgisonline.com`, `connect-src` the same, `style-src 'self' 'unsafe-inline'` for MapLibre, `worker-src blob:`). No CDN scripts: MapLibre is bundled, icons are inline SVG.

---

## 6. Cutover

### 6.1 Timeline (compressed: cutover as soon as the full rehearsal passes)

Decided: no fixed date and no waiting for the opt-out deadline. The banner (9 Oct) and the email (15 Oct) already told people; opt-outs received through 15 October are honoured by deleting those people after the migration (`delete-user`, 3.6). The minimum safe path:

| Step | What | Gate |
|---|---|---|
| Now | Dump moved out of the repo (done). Root `.htaccess` `.sql` refusal, move-notice fixes (link, address, "we may move before the 15th; opt-outs are still honoured"), Instagram handle: prepared in the legacy prep branch. **Deploying to Silk needs your go-ahead.** | — |
| Now, in parallel with the build | Create the Vercel project, Neon database, two Blob stores, Resend domain; add the Resend DNS records and verify; point `A @`/`CNAME www` at Vercel behind the app's launch gate (Hobby has no password protection) so DNS, TLS and mail are proven while the app is built. **Each is an external action: your go-ahead per item, listed in `docs/vercel-setup.md`.** | — |
| Phase 2 done | Send a code to 2–3 real `@uvm.edu` mailboxes from a preview deploy; note where it lands. | — |
| Phase 9 done | Rehearsal #1 on a Neon branch from the 8 Oct dump. **Your approval of the rehearsal.** | `--verify` exits 0 |
| Phases 3–8 done | Rehearsal #2 on `main` with the real stores, from a fresh read of the live DB (**Silk access: your go-ahead**). 1–2 days of testing by you and 2–3 testers on the gated site. | your sign-off |
| **T0** | Freeze → final read → verify → open the gate read-only → Silk redirect → smoke test → enable writes → welcome mail (6.3). Each external step asked for individually. | 6.3 |
| T+2 d | Rollback window closes. Switch the shim from 302 to 301. | |
| T+7 d | Decommission the database and the home-directory backups (6.5). | |
| T+90 d (7 Jan 2027) | Remove the shim; the same day, you delete `go.uvm.edu/sublet` yourself (decided 17 Oct: the link stays until then so old flyers keep working; no request email). | |

**What was cut, and the risk each cut carries:**

| Cut | Risk | Mitigation |
|---|---|---|
| The 14-day notice period before cutover | People who read the banner expect the site to stay as-is until at least 15 Oct; a cutover before then surprises them. | The corrected move notice says the move may happen sooner and that opt-outs through 15 Oct are still honoured; the welcome mail explains how to delete. |
| Waiting for the opt-out deadline before migrating | Someone who opts out after the migration has had their data on the new site for a few days. | `delete-user` runs the day the reply arrives; nothing is public that was not already public on the old site; welcome mail is withheld from anyone in `opt-outs.txt` at send time. |
| The three-week DNS/Resend lead time | If the cloud setup is delayed, Resend verification (up to 72 h) or DNS propagation becomes the critical path. | Do the cloud setup now, in parallel with Phases 1–2; it does not depend on the code. |
| A full week of tester use | Deliverability or UX problems surface closer to cutover. | Code delivery to real `@uvm.edu` mailboxes is tested at the end of Phase 2, weeks before cutover; the read-only soft open on cutover day is the last check. |
| Notice #2 ("read-only from <time>") | Someone mid-edit on the old site gets a 503 on save. | The freeze returns a clear message and the banner says where to go; edits made on the old site in the final hour are visible in the final read. |
| Domain warm-up before the welcome mail | More welcome mails land in Junk. | Welcome mail is one message per person, plain, with the sender named; the sign-in page tells people to check Junk; the code mail is tested beforehand. |
| `go.uvm.edu/sublet` kept for 90 days, then deleted | QR codes on old flyers and the painted URL in old stories die at T+90 d. | Decided; until then the link reaches the shim and its 301; the flyers are being redrawn anyway. |

Kept: the `--verify` gate, the Neon restore point, the read-only soft open, the 48-hour rollback window with the legacy tree intact, the T+7 d decommission.

### 6.2 Freeze

At the Apache layer, so no forgotten code path can write. Added to `app/.htaccess` (mod_rewrite is already on there), outside the managed block:

```
RewriteCond %{REQUEST_METHOD} !^(GET|HEAD)$
RewriteRule ^ - [R=503,L]
```

Not `<LimitExcept>` + `Require all denied`: it ORs with the directory's `Require ldap-filter`. Pair it with the announcement banner. Reads keep working. Deploy the two lines commented out beforehand and uncomment at T0.

### 6.3 Cutover day

1. Enable the freeze; publish the banner.
2. Read the frozen source (3.1) and `rsync` originals into the private working folder.
3. `migrate:legacy --dry-run --prune --opt-outs opt-outs.txt` against `main`; read the plan.
4. Create a Neon branch of `main` as the restore point. `--apply --images --prune --opt-outs opt-outs.txt`, then `--verify`; it must exit 0.
5. Open the gate with `site_settings['read_only']` on: the site is reachable, sign-in and browsing work, writes are refused with a banner.
6. Deploy the Silk shim (6.4) by renaming the docroot (`cd $PARENT && mv $SITE $SITE.off && mkdir $SITE && cp $SITE.off/shim/.htaccess $SITE/`, with `PARENT` the home directory and `SITE` the docroot directory), leaving the old tree and `public/images/` in place.
7. Smoke test as a non-admin tester: sign in by code; Browse; open a listing; the email panel shows the right address; Map pins; an old share link from a phone (302 → new `/s/` → preview → sign-in → the right listing); an old `og:image` URL resolves to the new card; admin tabs load.
8. Turn `read_only` off. **Point of no return for a lossless rollback.** Edit a test listing with a photo; pause and resume it.
9. **Welcome mail** (chunked sender, excluding `opt-outs.txt`): "Your listing is live at catamountsublets.com; sign in with a code sent to this address (your NetID address); here is how to delete your data".
10. ~~You send the `go.uvm.edu` deletion request.~~ Superseded 17 Oct: the link stays until T+90 d and you delete it yourself with the shim (6.5).

### 6.4 What the old URL does afterwards

The shim is a one-file document root: no PHP, no `app/.htaccess` (so no `AuthType CAS`, and nothing on the host ever redirects to `idp.uvm.edu` again), no NetIDs on disk in the served tree. Temporary redirects during the rollback window, permanent after it:

```
RewriteEngine On
Header always set Cache-Control "no-store"
RewriteRule ^s/([0-9]+-[a-f0-9]{10})/?$          https://catamountsublets.com/s/$1 [R=302,L]
RewriteCond %{QUERY_STRING} (^|&)i=([0-9]+-[a-f0-9]{10})(&|$)
RewriteRule ^share-card\.php$                     https://catamountsublets.com/share-card/%2/og? [R=302,L]
RewriteCond %{QUERY_STRING} (^|&)id=([0-9]+)(&|$)
RewriteRule ^app/(index\.php)?$                   https://catamountsublets.com/listing/%2? [R=302,L]
RewriteRule ^app(/.*)?$                           https://catamountsublets.com/browse [R=302,L]
RewriteRule ^.*$                                  https://catamountsublets.com/ [R=302,L]
```

`/s/<slug>` is what people pasted into stories and chats; `/share-card.php?i=…` is the `og:image` URL Meta and X already cached; `/app/index.php?id=N` is the link inside old interstitials and admin notices. A redirect rather than a notice page: a notice page would still be a UVM-hosted page carrying the site's name. At T+2 d flip `302` → `301` and drop the `no-store` header.

### 6.5 Decommission

T+7 d: drop every table in the Silk database through phpMyAdmin (or a Silk ticket); delete `$SITE.off` (the old tree, including `public/images/` and `public/share/`), the home-directory backup and script folders, and the legacy secrets in the home directory's `.env`. Locally: delete the private migration folder (dump, images, deletion log) once the log has been copied somewhere private. Archive the legacy GitHub repository read-only after a final commit that removes `app/.htaccess` from the tip. T+90 d (7 Jan 2027): delete `go.uvm.edu/sublet` yourself, then remove the shim, the same day (`docs/cutover-aaron-checklist.md`, "Later"). The link stays until then so old flyers keep working.

Record (T+8 d, Sat 17 Oct 2026):

| Item | State |
|---|---|
| Silk: `$SITE.off` and the home-directory backup and script folders | **deleted**; live docroot is the shim only, 301s still work |
| Silk: three hidden old copies of the site with user photos and HEICs (~870 MB) | **deleted**, except one root-owned folder with one jpg from a March 2025 restore: **pending** a UVM web-hosting ticket |
| Silk: Claude Code transcripts, caches and plan from the old Silk sessions | **deleted** |
| Silk: permissions on the home directory's env files | tightened |
| Silk: the legacy database | **all 7 tables dropped** (phpMyAdmin; the app's own database account cannot DROP); 0 tables left, other databases unchanged. No final archive (decided): `listing_events` and `allowed_users`, never migrated, are gone with it |
| Silk: legacy env files in the home directory | **pending** |
| Neon branch `pre-cutover-2026-10-09` (the cutover restore point) | **deleted** 17 Oct |
| Neon branches `rehearsal` (Preview reads it) and `dev`, which held the 8 Oct import of real listings | **emptied in place** 17 Oct (`public` and `drizzle` schemas dropped and recreated, owner and grants as before, so the connection strings are unchanged), all 5 migrations applied, `npm run db:seed`: each holds only the 6 seed posters, the seed admin, 6 listings and 14 `/seed/` photos; 0 sessions, events or migrated accounts. Neon history retention is 6 h |
| Mac: the private migration folder (both dumps, logs, welcome batches), the legacy env file, the rsynced originals | **deleted** 17 Oct (`rm -rf`, not the Trash); no other dump or phpMyAdmin export anywhere in `~`, Downloads and Desktop included, and no Time Machine destination |
| Legacy GitHub repo (already private) | **archived** 17 Oct: `app/.htaccess` (the NetID allowlist) removed from the tip, renamed, archived, still private. History keeps earlier allowlists (decided: no rewrite, the repo stays private). `sublets-legacy/` points at the local clone |
| `go.uvm.edu/sublet` | **kept until T+90 d** (decided 17 Oct), so old flyers keep working through the shim's 301; you delete it yourself with the shim. No request email (`docs/go-uvm-link-request.md` is the fallback if go.uvm.edu will not let the owner delete it) |

### 6.6 Rollback (within 48 hours)

Trigger: sign-in failing for most people, data wrong in a way `--verify` did not catch, or an outage you cannot fix in an hour. Steps: `mv $SITE $SITE.broken; mv $SITE.off $SITE` (in the Silk home directory), comment the freeze rule out, clear the banner; the new site goes behind its gate again. If writes were enabled before the rollback, the handful of edits made on the new site are visible in Neon and re-entered by hand. After the window the Silk copy is deleted and there is no rollback.

---

## 7. Phased task list

Sizes: **S** ≤ half a day, **M** 1–2 days, **L** 3–5 days of a coding agent's time. Each phase ends with something runnable and a two-line summary.

| # | Phase | Size | Deliverable | Done when |
|---|---|---|---|---|
| 0 | **Repo and scaffold** | S | This repo: Next 16 + TS strict + Tailwind v4, npm, ESLint (no-console), vitest + PGlite, `src/env.ts`, `src/config/site.ts`, `.env.example`, `.gitignore` (`.env*`, `*.sql`, `sublets-legacy/`, `legacy-images/`, `opt-outs.txt`), README, CLAUDE.md, `docs/vercel-setup.md` (every external step, for your go-ahead), `docs/go-uvm-link-request.md`. Legacy repo: dump moved out. | `npm run build` and `npm test` pass; first commit made after confirming the ignores. Cloud resources on your go-ahead. |
| 1 | **Schema, migrations, domain helpers** | M | Drizzle schema per 2.2 (auth tables generated by the better-auth CLI and extended), first migration, seed (semesters, admin user), `lib/visibility.ts`, `lib/semesters.ts`, `lib/distance.ts`, `lib/dates.ts`; unit tests on PGlite. | migrations apply on PGlite; tests green. |
| 2 | **Auth** | M | better-auth + emailOTP + admin plugin + Drizzle adapter + Resend (console mode locally); OTP email template; sign-in page (NetID-form rule, "check Junk / resend in 60 s"); `assertEmailAllowed` in both hooks; rate limits; `requireUser()`/`requireAdmin()`; `(app)` layout gate; sign-out; account page skeleton. | Local sign-in with a console code; `gmail.com` and `jane.smith@uvm.edu` refused before any email. Then (your go-ahead) a real code to 2–3 `@uvm.edu` mailboxes from a preview. |
| 3 | **Read side: Browse, listing view, Map** | L | Listing queries, DTOs, `FilterBar`, cards, live updates, deep link, intercepting-route listing view with gallery and contact panel, Map with MapLibre, pins, popups, fallback basemap; palette tokens applied. | Seeded data browses and maps correctly on a phone and a laptop. |
| 4 | **Post form and photos** | L | zod `listingInput`; Server Actions create/update/status/delete; address combobox on Photon; map pin + reverse lookup; private-store client upload + `attachPhoto` with sharp (four variants, sha256); photo move/cover/delete; semester pills; status panel; `read_only` honoured; admin notice emails. | Create → edit → pause → delete round trip with 5 photos incl. a HEIC. |
| 5 | **Share** | M | `lib/share.ts` (new + legacy tokens, `shareCardLines`), `/s/[slug]` page, share-card route with `ImageResponse`, share sheet with the story-image file share, `share_arrival` wiring. | A legacy slug renders a preview; iMessage/Instagram unfurl a preview deploy's link. |
| 6 | **Activity log** | M | `/api/events`, whitelists, Eastern-day dedupe, rate limit, exclusions; readers; poster stats line. | Beacons appear with the right dedupe keys. |
| 7 | **Admin** | L | Semesters (+ archive with manifest), Announcement, Posts, Images, People, Email, Activity; Vercel Cron for the sweeps. | Every admin action in section 4 works against seeded data. |
| 8 | **Brand, copy, polish** | M (+ your design time) | Landing page, mark, favicon, og/story fallback graphics, email chrome, 404/error pages, privacy note, every string from the 1.8 "wording" row rewritten, CSP, accessibility pass, contrast check; a CI grep that fails on `uvm|netid|fellow catamount` outside `src/config/site.ts` and the sign-in copy. | No "UVM", "NetID", "CAS", green or gold anywhere in the app or its emails. |
| 9 | **Migration script + delete-user** | M | `scripts/migrate-legacy/` per section 3 with every flag; `scripts/admin/delete-user.ts`; a README with the exact commands; rehearsal #1 on a Neon branch from the 8 Oct dump (**your approval before it runs**). | `--verify` exits 0 on the branch; you have read the report. |
| 10 | **Cutover prep** | S | Legacy prep branch: `.sql` refusal, move-notice fixes, Instagram handle, the freeze rule (disabled), the shim `.htaccess`. New: welcome-mail template, smoke-test checklist, `launched` gate, `docs/cutover-runbook.md`. Rehearsal #2 on `main`. | Deploy of the prep branch to Silk on your go-ahead; testers signed in. |
| 11 | **Cutover day** | S | Section 6.3, in order, with you at the keyboard. | Smoke test passes; writes enabled; welcome mail sent. |
| 12 | **Decommission** | S | T+2 d (301), T+7 d (6.5), T+90 d. | Nothing of the app remains on UVM infrastructure except the redirect, then nothing. |

Phases 1–2 and 3–4 can run in parallel; 5–7 depend on 3–4; 9 depends on 1 only and starts right after it so rehearsal #1 happens early.

---

## 8. Decisions log (formerly open questions)

| # | Decision (8 Oct 2026) |
|---|---|
| 1 | Name: Catamount Sublets. No "fellow Catamounts", no athletics-style copy; keep the "not affiliated with UVM" footer line. Mark (revised 9 Oct): an original drawing of a cat lying on a house roof, redrawn from a friend's concept, deliberately not the statue's pose. |
| 2 | Sign-in: `@uvm.edu` domain rule, `ALLOWED_EMAILS` as the escape hatch, allowed domains in a config array. |
| 3 | Admin: the operator's own non-UVM address from day one (exception list); the legacy admin's listing migrates to that account. |
| 4 | Share secret: determined empirically from the Silk `.env` / `DBPASS` fallback. |
| 5 | Archives: manifest only, no tarball, no archive copy of photos. |
| 6 | `go.uvm.edu/sublet`: kept until T+90 d and deleted by you the same day as the shim (changed 17 Oct from "ask UVM to delete it at cutover"); no request email; the draft in `docs/go-uvm-link-request.md` is only the fallback. |
| 7 | Geocoding: Photon. |
| 8 | Instagram: `@uvmsublets` → `@catamountsublets`; all references updated. |
| 9 | Typeface: Bricolage Grotesque. |
| 10 | Styling: Tailwind v4 with `@theme` tokens (four of six sibling projects use Tailwind v4). |
| 11 | Analytics: `listing_events` starts fresh at cutover; `semester_archives` keeps historic totals. |
| 12 | Deleted listings: their events are deleted with the listing (FK cascade). |
| 13 | Photo cap: 25 per listing. |
| 14 | Opt-out: reply-by-email to the notice; `opt-outs.txt` (gitignored) feeds the migration; later opt-outs via `delete-user`. |
| 15 | Resend: paid plan for the launch month; codes are never queued behind broadcasts. |
| 16 | Vercel: **Hobby** (revised 8 October). No WAF and no Deployment Protection; app-level Postgres-backed rate limits and the launch gate instead. Hobby limits checked in `docs/vercel-setup.md` §8: the one risk is Blob's monthly caps, which block the store for 30 days when exceeded. |
| 17 | Cutover: as soon as the full rehearsal passes; opt-outs through 15 Oct honoured after the fact with `delete-user`. |
