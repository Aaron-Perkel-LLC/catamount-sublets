# Cutover runbook

The day the board moves from `sublet.aperkel.w3.uvm.edu` to `catamountsublets.com`:
**Friday 9 October 2026, 7:00 am ET** (LLC work, before the UVM workday). Aaron's own
steps, with exact commands, are in `docs/cutover-aaron-checklist.md`.
PLAN.md §6 is the reasoning; this is the checklist. Every step marked **[ext]**
touches something outside this repo (Silk, DNS, mail, the production database)
and is done only on an explicit go-ahead, one at a time.

## Before the day

- [x] Cloud resources exist and are verified (`docs/vercel-setup.md`, 8 October): Vercel project on the domain, Neon `main` (schema only), both Blob stores, Resend domain green, env vars set, Vercel Authentication on with a bypass secret for testers.
- [x] Rehearsal #1 on the `rehearsal` branch and the zero-write re-import on `dev` both verified (8 October); the real `media` store already holds every photo, so the cutover import reuses them. There is no separate rehearsal #2: the cutover-day dry run against `main` is that gate.
- [x] Production is deployed on the domain with the launch gate closed; catamountsublets.com says "Opening soon" (8 October).
- [x] Testers signed in on the preview (8 October): every code landed in Inbox, refusals and the resend limit behaved.
- [x] One welcome test message received and read on a phone: `npm run send-welcome -- --to <Aaron's own address>` **[ext]** (landed in Inbox at UVM).
- [ ] A fresh dump is exported from phpMyAdmin at freeze time (with `SET time_zone = "+00:00"`, as the 8 October one was) and the originals re-rsynced, so the import reads the frozen state, not the 8 October snapshot.
- [x] The legacy prep commits are live on Silk (8 October): `.sql` refusal, corrected move notice, freeze rule present but commented out, shim in the tree. Any later pull on Silk: `git stash && git pull --ff-only && git stash pop` (see `docs/vercel-setup.md` §7).
- [ ] `opt-outs.txt` in the private working folder holds every opt-out received (one NetID or email per line).
- [ ] `LEGACY_SHARE_SECRET` / `LEGACY_DBPASS` and the production `DATABASE_URL` and Blob tokens are in the shell that runs the migration, nowhere on disk in a repo: the block in HANDOFF.md ("The import command"). Checked read-only 8 Oct night: Neon `main` connects and both stores list.

## The day

**Nobody signs in on production until after step 5.** A sign-in creates rows on Neon `main`; a stray one on 8 October had to be deleted so the import ran against an empty database.

1. **Freeze Silk** [ext]. Uncomment the two `RewriteCond`/`RewriteRule` lines in `app/.htaccess` (above the managed block). Publish the banner from the legacy Announcement tab: "UVM Sublets is read-only while it moves to catamountsublets.com." Confirm a POST to `/app/post.php` gets a 503 and GETs still work.
2. **Read the frozen source** [ext]. A fresh phpMyAdmin export into the private working folder's `dumps/` (`--source dump --dump <file>`), or the SSH tunnel (`--source mysql`); `rsync` the originals again into its `legacy-originals/` (`--images-dir` points there).
3. **Dry run against production** (`DATABASE_URL` = Neon `main`, `LEGACY_SHARE_SECRET` from the legacy env file, both Blob tokens in the shell; set them with the block in HANDOFF.md, whose last line prints only lengths):
   ```
   npm run migrate:legacy -- --dump "$WORK/dumps/<fresh>.sql" --images-dir "$WORK/legacy-originals" --opt-outs "$WORK/opt-outs.txt" --prune
   ```
   Read the plan. Expected on an empty `main`: 44 user inserts (43 posters plus the admin) and 43-ish listing inserts, 0 updates, 0 deletes; opt-outs show as excluded. (The 8 October dump gave exactly that on 8 Oct night.) Stop if any number surprises you.
4. **Restore point** [ext]. Create a Neon branch of `main` named `pre-cutover-<date>`.
5. **Apply** [ext]:
   ```
   npm run migrate:legacy -- … --apply --images --prune --verify --fetch-images
   ```
   Expected: users 44 inserted, 0 updated (the admin is created by the import, with no listing); listings 43 inserted; `images` shows every file **reused**, 0 uploaded (the rehearsal put them there); the only verify problem is the three orphan files on disk.
6. **Soft open**. Admin → Announcement: turn **Read-only** on with "Opening in a few minutes"; then **Open the site**. The front page shows the board; writes are refused.
7. **Silk shim** [ext]. On Silk, with `PARENT` the home directory and `SITE` the docroot directory: `cd $PARENT && mv $SITE $SITE.off && mkdir $SITE && cp $SITE.off/shim/.htaccess $SITE/`. The old tree, `public/images/` included, stays at `$PARENT/$SITE.off` for the rollback window. Exact commands: `docs/cutover-aaron-checklist.md`.
8. **Smoke test** (below), as a non-admin tester, on a phone and a laptop: Aaron signing in with his own `@uvm.edu` address, which creates a fresh ordinary account with no NetID (his legacy NetID belongs to the admin address, which has no listing), so "Post" shows the new-poster empty form.
9. **Enable writes**. Read-only off. Edit a test listing with a photo (one HEIC from Safari); pause and resume it; delete the test listing.
10. **Welcome mail** [ext]: `npm run send-welcome` (the dry run must say `mail: resend`; read the order, most recently active first, and who is skipped) then `npm run send-welcome -- --apply --without-bounce-check`, with `DATABASE_URL` on Neon `main` and `RESEND_API_KEY` in `.env.local`. No bounce watch (decided 8 Oct: every recipient was active this year, so no `RESEND_ADMIN_API_KEY`); keep Resend's dashboard open and Ctrl-C if bounces pile up; a re-run skips everyone already mailed. One message a second; the log carries each Resend id. If Resend cannot be used, the fallback is Aaron sending from aaron@catamountsublets.com in BCC batches of 15 (`npm run welcome-batches`, see the checklist); never UVM's relay.
11. Note the time in PLAN.md's status table.

## Smoke test

- [ ] `/` shows the board with the right count and semester phrase.
- [ ] Sign in with a code: arrives within a minute; wrong code refused; `jane.smith@uvm.edu` form refused with the hint; a non-allowed domain refused before any mail.
- [ ] Browse: filters change the grid live; sort works; the count badge matches.
- [ ] A listing opens: gallery arrows, dots, counter; Back closes it; the email panel shows the poster's contact address; Call/Text on a phone.
- [ ] Map, on production, on a phone and a laptop: the basemap is **OpenFreeMap** (normal-case street names, a sand campus, "OpenFreeMap" in the credit), not Esri's grey fallback (ALL-CAPS streets, "Esri" credit); pins with prices, grouped pins show a count, popups open the listing.
- [ ] Post map: the address map draws the same OpenFreeMap basemap and a tap drops the pin.
- [ ] An **old share link** from a phone: `sublet.aperkel.w3.uvm.edu/s/<id>-<token>` → 302 → `/s/<slug>` renders the preview with the right price and semester → Sign in → the right listing opens.
- [ ] An old `og:image` URL (`/share-card.php?i=<slug>&f=og`) redirects to a card that renders.
- [ ] A share from the new site unfurls in iMessage (card, title, no address).
- [ ] Post: the tester's own listing page loads (new poster: empty form; migrated poster: their listing with photos in order).
- [ ] Admin: all seven tabs load; Activity shows the migrated totals; People lists the migrated accounts with "(migrated)".
- [ ] `/privacy`, `/nope` (404), and the error page are branded.
- [ ] Response headers on `/`: CSP with a nonce, nosniff, frame options.

## Rollback (within 48 hours) [ext]

On Silk: `cd $PARENT && mv $SITE $SITE.broken && mv $SITE.off $SITE`, comment the freeze rule back out, clear the banner. Close the launch gate on the new site. Edits made on the new site after step 9 are read out of Neon and re-entered by hand.

## After

- T+2 d: shim `302` → `301`, drop the `no-store` header [ext].
- T+7 d: decommission per PLAN.md §6.5 [ext].
- T+90 d (7 Jan 2027): Aaron deletes `go.uvm.edu/sublet`, then removes the shim, the same day [ext]. Commands: `docs/cutover-aaron-checklist.md`, "Later".
