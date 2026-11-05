# Handoff: Catamount Sublets cutover

For a fresh session taking over on Friday 9 October 2026. Everything a new
session must know and nothing it can read from the code. Dates below are 2026.

## What this is

UVM Sublets (PHP on UVM Silk, CAS sign-in, MySQL on UVM's database server, live at
`sublet.aperkel.w3.uvm.edu`) is moving to Catamount Sublets at
`catamountsublets.com`: Next.js 16 on Vercel, Neon Postgres, Drizzle, email
one-time-code sign-in for `@uvm.edu`, Resend for mail, Vercel Blob for photos.
`PLAN.md` is the full design with a status table at the top;
`docs/cutover-runbook.md` is Friday's step list; `docs/cutover-aaron-checklist.md`
is Aaron's own steps with exact commands; `docs/vercel-setup.md` is every cloud
resource and the Hobby-plan limits. The legacy code is a clone of its own
private, archived repository, symlinked here as `sublets-legacy/` (gitignored).

## Aaron's standing rules

- STOP and ask before anything external or irreversible: sending any email,
  changing DNS, touching Silk or its database, writing to Neon `main`,
  buying or upgrading a plan, deleting data. On cutover day every external
  step needs its own individual go-ahead.
- Never commit or print the SQL dump, `.env*` values, or real user data.
  Recipient lists, dumps and logs live in a private working folder (`$WORK`
  below), outside every checkout. Do not echo NetIDs or addresses into chat beyond what he asks for.
- He pushes to Silk and does every Silk step himself; give exact commands.
- Reading the live legacy site over HTTP was blocked by the permission
  classifier; ask him to run such checks with `!`.
- When a phase finishes: a two-line summary and what's next.

## Cutover: Friday 9 October, 7:00 am ET

Runbook: `docs/cutover-runbook.md`. His checklist: `docs/cutover-aaron-checklist.md`.
Order: he publishes the banner and enables the freeze on Silk → exports a fresh
phpMyAdmin dump to `$WORK/dumps/` and re-rsyncs originals into
`$WORK/legacy-originals/` → finalises `opt-outs.txt` (and
optionally `suppressed.txt`, `skip.txt`) → **we** dry-run the import against
Neon `main` → he approves a Neon restore branch, the apply, the soft open →
he installs the Silk shim → smoke test → writes on → welcome mail.

The import command (dry run; add `--apply --images --prune --verify --fetch-images` to apply):

```bash
umask 077
# In this shell only, never in a file inside a checkout, never echoed:
#   LEGACY_SHARE_SECRET            the legacy site's share secret
#   DATABASE_URL                   the production Neon branch, pooled (neonctl connection-string)
#   BLOB_MEDIA_READ_WRITE_TOKEN    the public media store
#   BLOB_UPLOADS_READ_WRITE_TOKEN  the private uploads store (a sensitive Vercel variable
#                                  pulls as a placeholder, so take the store's auto-named
#                                  BLOB_READ_WRITE_TOKEN, which holds the same value)
for k in LEGACY_SHARE_SECRET DATABASE_URL BLOB_MEDIA_READ_WRITE_TOKEN BLOB_UPLOADS_READ_WRITE_TOKEN; do eval "v=\$$k"; echo "$k length ${#v}"; done   # lengths only; none 0, none the placeholder's 11
npm run migrate:legacy -- --dump "$WORK/dumps/<fresh>.sql" --images-dir "$WORK/legacy-originals" --opt-outs "$WORK/opt-outs.txt" --prune
```

The earlier runs used a wrapper at the session scratchpad; it is gone with the
session. Checked on 8 Oct night: `main` connects and both stores list with
those tokens. A stray sign-in by Aaron on production (one account and its
code and rate-limit rows) was deleted from `main` that night on his go-ahead,
so `main` is schema only again (14 tables, all empty, migrations 0000–0003),
and the dry run against it planned 44 user and 43 listing inserts, 0 updates,
0 deletes. **Nobody signs in on production until after the apply.**
Expected on the apply: 43 listings and 44 accounts inserted, 0 updated (43
posters plus the admin, which the import creates with no listing, as on
`rehearsal`), 196 photos processed with every file **reused** from
the media store (0 uploads), and the only verify problem the three orphan
files on disk that no row names. Step 0 (pull legacy on Silk) was done
Thursday night: Silk HEAD `1256de1`, status clean, shim matches GitHub.

Rehearsals done: rehearsal #1 on the Neon `rehearsal` branch (what Preview
reads), and a zero-write re-import on `dev` that proved file reuse. Production
reads `main`, which holds only the schema (migrations 0000–0003) and no rows;
the front page therefore says "Opening soon" (launch gate closed).

## Cloud resources

- **Vercel** (Pro): project `catamount-sublets` in the Aaron Perkel LLC team, git-connected to this repo, production branch `main`: **a push to main deploys production**. Previews: `vercel deploy --target=preview` (a bare `vercel deploy` targets production). Vercel Authentication is on for everything except the custom domain; testers open a preview through the project's protection-bypass link (Project settings → Deployment Protection). Framework preset was set by API; Node 24.
- **Domains**: `catamountsublets.com` (A/CNAME at Cloudflare, DNS-only, project-specific CNAME flattened at the apex), `www` 308s to the apex. Never touch the iCloud MX, apex SPF or `sig1._domainkey`.
- **Neon**: org "Aaron Perkel LLC", project `catamount-sublets`, region aws-us-east-1, Postgres 17, database `catamount_sublets`, branches `main` (production), `rehearsal` (Preview's data), `dev`. `neonctl connection-string <branch> --project-id … --database-name catamount_sublets [--pooled]`.
- **Blob**: `uploads` (private → `BLOB_UPLOADS_READ_WRITE_TOKEN`, also auto-named `BLOB_READ_WRITE_TOKEN`), `media` (public → `BLOB_MEDIA_READ_WRITE_TOKEN`). Both stores are in the LLC's Pro team (moved 2026-10-12), so the Hobby caps no longer block the store; usage past Pro's included amount is billed instead. The cutover import writes nothing. The admin Images tab shows usage.
- **Resend**: root domain verified (DKIM, `send`/`rsend` CNAMEs, `_dmarc` at `p=none`). Sender `Catamount Sublets <login@catamountsublets.com>`, Reply-To `aaron@catamountsublets.com` on every message. The key in Vercel (Preview and Production) and in `.env.local` is **sending-only**: it cannot read statuses, domains or suppressions. Paid plan.
- **GitHub Actions** CI runs lint, typecheck, tests, brand check and a build with dummy secrets; green as of commit `6b26e38`.
- **Legacy**: on Silk the document root is the legacy repo's git checkout (`PARENT` is its parent directory and `SITE` the docroot directory in the checklist). The legacy secrets were kept in a gitignored env file outside this repo; `SHARE_SECRET` is the one in use, confirmed by a share-link check returning 200.

## Decisions Aaron has made (do not reopen)

- Name stays Catamount Sublets; no cat silhouette; keep the "not affiliated" line.
- Built for Vercel Hobby (no WAF, no password protection): app-level Postgres-backed rate limits (`src/server/rate-limit.ts`) and the launch gate. The project moved to the Aaron Perkel LLC **Pro** team on 2026-10-12; those safeguards stay, and Pro's WAF custom rules are available but not set up.
- Stay on Vercel Blob; no original is stored (display, thumb, card only, ~300 KB a photo). Cloudflare R2 is the documented fallback, not built.
- Sign-in is NetID form only: `netid@uvm.edu`; `first.last@uvm.edu` aliases are refused with "Use your NetID email (netid@uvm.edu), not your first.last alias." (the sign-in hint, placeholder and welcome mail say `netid@uvm.edu` too; changed 8 Oct) `ALLOWED_EMAILS` (from `NEXT_PUBLIC_ADMIN_EMAILS`) holds the admin's own non-UVM address, the admin from day one.
- First and last name required of everyone: `/welcome` after the first code; migrated accounts asked once, prefilled from the legacy "name shown" where it looked like a full name. Header shows the name, never the NetID.
- Resend on the root domain, sender `login@`, Reply-To aaron@. Welcome mail is a plain personal note signed Aaron, subject "UVM Sublets has moved to catamountsublets.com", greets by first name or "Hi," alone, carries List-Unsubscribe. It landed in Inbox at UVM.
- Nothing is ever sent through UVM's relay or from Aaron's UVM address. If Resend cannot be used, Aaron sends from aaron@catamountsublets.com in BCC batches of 15 (`npm run welcome-batches`).
- Logged-out visibility stays as it is (front-page thumbnails, share preview with price/semester/size/distance and cover photo, photos public by unguessable URL; everything else behind sign-in). It matches the old site.
- Keep events fresh at cutover; deleted listings' events are deleted; photo cap 25; archives keep a manifest, no tarball; opt-out by reply email; the `go.uvm.edu/sublet` link stays until T+90 d and Aaron deletes it the same day as the shim (decided 17 Oct; no request email, `docs/go-uvm-link-request.md` is only the fallback).
- Cutover ASAP, no waiting for an opt-out deadline; opt-outs received through 15 October are honoured afterwards with `npm run delete-user`.
- Phone/desktop breakpoint is the legacy 768 px line (Tailwind `md` = 769 px); phone header is name + hamburger, as the old site.
- Generated og/story graphics ship as they are.

## Open items

- Friday: everything in the runbook. Watch the Resend dashboard yourself for warnings (we cannot). Welcome send runs with `--without-bounce-check` (decided 8 Oct: every recipient was active this year; no `RESEND_ADMIN_API_KEY`), so watch Resend's dashboard during it. Welcome test message done. Non-admin smoke tester: Aaron with his own `@uvm.edu` address, a fresh ordinary account with no NetID (on `rehearsal` it sits beside the admin with no collision, because his legacy NetID maps to the admin address instead). The production map check is in the runbook's smoke test, after the apply.
- Testers confirmed codes, refusals, the resend limit, share image, listing, email panel, admin and the phone nav on previews. The map background was made faster (raster underlay, inlined TileJSON, opens on the listings) but not timed on a phone by us. Until 8 Oct night the vector map never drew anywhere: MapLibre 6 could not find its worker inside a Turbopack chunk, so `/map` showed only the Esri raster and the post form's map stayed blank. The worker is now served from `public/maplibre-gl-worker.mjs` (`src/components/map/worker.ts`; a test fails if it drifts from the installed MapLibre, so an upgrade means copying it again).
- Not built: the Resend bounce webhook (`/api/resend/webhook`), R2 driver. `www` redirect done. `.env.local` also holds the auto-added `BLOB_READ_WRITE_TOKEN` and a `VERCEL_OIDC_TOKEN` from `vercel link`; harmless.
- After the day: T+2 d shim 302→301 and drop the no-store header; T+7 d decommission (PLAN.md §6.5); T+90 d (7 Jan 2027) delete `go.uvm.edu/sublet`, then remove the shim.

## Gotchas we hit

- **Rotating the Resend key needs a redeploy** of Preview and Production; a build made before the variable existed runs without it. Check the `boot.mail` log line (`resendKey: true, mode: resend`).
- **Sensitive Vercel variables cannot be pulled** with `vercel env pull` (they come back as a placeholder). Take Neon URLs from `neonctl`; `vercel env add … --sensitive --force --value` overrides in place ("Overrode").
- **Console-mode fallback**: originally any environment without a key printed codes to the log; the preview did exactly that while the form said "check your inbox". Now: on Vercel a missing key is a failed send shown to the person; off Vercel a real send needs `MAIL_LIVE=1`, which only the admin scripts set, so `next dev` prints even with a key in `.env.local`. Env validation rejects an empty `RESEND_API_KEY=`; sideline the file instead if you need a key-free local run.
- **Seed addresses**: three real sends went to seed1–3@uvm.edu and bounced. `sendMail` now refuses seed/fixture/example addresses everywhere, the seed script refuses remote databases without `SEED_ALLOW_REMOTE=1` and any database holding migrated accounts, and `--verify` flags a test address in the target.
- **Silk paths**: the docroot directory is not simply `sublet`; every `mv` in the checklist uses `$SITE`. The freeze lines are commented in `app/.htaccess` above the managed access block; banner first, then freeze, because the freeze blocks the banner save.
- **Pulling on Silk**: `git stash && git pull --ff-only && git stash pop` (the managed access block in `app/.htaccess` is a local change when the Access tab has been used; it was clean on Thursday).
- **Migration script quirks**: the dry run needs `DATABASE_URL` set or it silently uses the local PGlite; PGlite is single-process (never run a script while `next dev` is up); `--verify` exits 1 on the three orphan files, which is expected; the admin account is created by the import even though it has no listing.
- **Vercel CLI**: `vercel project create` yields framework preset "Other" (every route 404s) until set to `nextjs`; `vercel blob create-store` connects only under `BLOB_READ_WRITE_TOKEN`, a second store had to be connected by API with its own prefix.
- **Lint**: check the whole output, not `tail -1`; the hooks rule rejects ref writes and setState inside effects (use the "adjust state during render" pattern).
- **Brand check** (`npm run check:brand`) fails on "uvm"/"netid" outside an allowlist in `scripts/check-brand.sh`; legacy names belong in `LEGACY` in `src/config/site.ts`.
- **Tailwind v4** gives buttons no pointer cursor; a base rule in `globals.css` does.
