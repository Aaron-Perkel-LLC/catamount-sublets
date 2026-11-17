# External setup — every step that touches an account or the internet

Each item below is an external action and is done only on Aaron's go-ahead.
The plan is **Vercel Hobby** (decided 8 October 2026): no WAF, no password
Deployment Protection, no paid add-ons. What that changes is in §8.

## 1. Vercel project (Hobby)

- `vercel project create catamount-sublets`, then `vercel link --project catamount-sublets --yes --scope <team>` in this repo. A project made from the CLI has Framework Preset **Other**, which deploys a Next.js build with no routes (every path 404s); set it with `vercel api /v9/projects/<id> -X PATCH -F framework=nextjs`. Node 24 comes from `engines` in `package.json`.
- Deployment Protection: **off for Preview** (`vercel project protection disable --sso`), so testers can open a preview URL without a Vercel account. There is no password protection on Hobby; the app's own launch gate kept Production at "Opening soon" until the site opened on 9 Oct 2026, and was removed on 11 Oct 2026.
- Environment variables (`vercel env add NAME production|preview`): see `.env.example`. `APP_SECRET`, `BETTER_AUTH_SECRET`, `CRON_SECRET` from `openssl rand -base64 32`, different per environment. `SURVEY_SECRET` (survey links, and the answer links in the "still available?" email) is separate from `APP_SECRET` so the same value can sit in `.env.local`, where `send-survey` signs the links; it is set for Production only, and a preview shows the invalid-link page for every survey link unless given its own. `APP_URL=https://catamountsublets.com` for Production only; previews fall back to their own URL. Preview's `DATABASE_URL` points at the Neon `rehearsal` branch, Production's at `main`.
- Rate limiting is in the app (`src/server/rate-limit.ts`, Postgres-backed): sign-in codes per address and per IP, verification attempts per address and per IP, listing creation per person; plus better-auth's own per-IP counters as a backstop. There is no firewall rule to configure.
- Deploying from the CLI: always `vercel deploy --target=preview`. A bare `vercel deploy` from this repo targets **production** (the CLI maps the `main` branch to it), and a production build refuses to start without `RESEND_API_KEY`.
- Domains: `vercel domains add catamountsublets.com` and `www.catamountsublets.com` (www → apex redirect). Note the A and CNAME values the domain card shows.

## 2. DNS (your registrar) — do not touch the apex MX/TXT or `sig1._domainkey`

| Type | Name | Value |
|---|---|---|
| A | `@` | the IP on the Vercel domain card (usually `76.76.21.21`) |
| CNAME | `www` | the target on the Vercel domain card |
| TXT | `resend._domainkey` | `p=…` (from Resend) |
| CNAME | `send` | the `…forge.rmta.net` host Resend shows (the bounce/return-path host) |
| CNAME | `rsend` | the `…forge.rmta.net` host Resend shows |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:aaron@catamountsublets.com;` |

Done 8 October 2026, all DNS-only at Cloudflare. Resend is verified on the
**root** domain, not a `mail.` subdomain: the return path is a CNAME, so the
apex SPF stays iCloud's, and the `_dmarc` record at `p=none` now also covers
iCloud's outbound mail, which is harmless at `p=none`; move it to `quarantine`
only after a clean week of reports for both senders. Confirm with
`dig +short catamountsublets.com A`, `dig +short MX catamountsublets.com` (still iCloud) and
`dig +short TXT resend._domainkey.catamountsublets.com`.

## 3. Neon (direct account, `neonctl`)

- `neonctl projects create --name catamount-sublets --region-id aws-us-east-1` (same region as Vercel's default `iad1`), Postgres 17, database `catamount_sublets`.
- Branches: `main` (production, empty until cutover day), `rehearsal` (migration rehearsal #1, what the preview deploy reads), `dev` (local work). Local `.env.local` points at `dev`, never `main`.
- Schema: `npm run db:migrate` against each branch's direct (unpooled) connection string. Vercel builds do not run migrations.
- Free plan: 0.5 GB storage, 100 compute-hours a month with scale-to-zero, point-in-time restore window of 6 hours (the cutover rollback is the Neon branch taken before `--apply`, not PITR).

## 4. Vercel Blob — two stores

- `vercel blob create-store uploads --access private --yes` → token `BLOB_UPLOADS_READ_WRITE_TOKEN` (raw client uploads).
- `vercel blob create-store media --access public --yes` → token `BLOB_MEDIA_READ_WRITE_TOKEN` (processed images only).
- Both connect to Production, Preview and Development. **Hobby caps: see §8.**

## 5. Resend (paid plan for the launch month)

- Domain `catamountsublets.com` (root), verified 8 October. Sender `Catamount Sublets <login@catamountsublets.com>` for codes, `notices@` for admin notices and access requests, `Aaron at Catamount Sublets <aaron@catamountsublets.com>` for broadcasts and the welcome, `Reply-To: aaron@catamountsublets.com` on every message (`SITE.mailFrom` / `SITE.mailFromNotices` / `SITE.mailFromPersonal` / `SITE.mailReplyTo`).
- API key with "sending access" only, scoped to the domain; set as `RESEND_API_KEY` for Production and Preview (done 8 October). `.env.local` only if you want real mail locally; otherwise codes print to the console.
- Webhooks → `https://catamountsublets.com/api/resend/webhook` for `email.bounced` and `email.complained` (create the endpoint once the handler exists).
- Upgrade before cutover (removes the 100/day cap).

### 5a. The digest's sending subdomain (`SITE.mailDigestDomain`, not set up yet; Aaron's)

The weekly saved-search digest sends from `digest@updates.catamountsublets.com` (`SITE.mailFromDigest`), a separate Resend domain, so bulk-mail complaints build reputation on `updates.` and never on the root domain that sign-in codes use. Reply-To stays `aaron@`.

1. Resend → Domains → **Add domain** `updates.catamountsublets.com`, region **us-east-1** (the root domain's region). Leave **click tracking and open tracking off** (click tracking rewrites every link through a redirect, which Microsoft 365 treats like a link shortener; open tracking adds a pixel image).
2. Resend then shows the records. Add them in Cloudflare exactly as shown, **DNS only (grey cloud)**. They should have the same shape as the root domain's records today (checked 16 Nov 2026 with `dig`):

   | Type | Name (in the `catamountsublets.com` zone) | Value | Notes |
   |---|---|---|---|
   | TXT | `resend._domainkey.updates` | `p=MIGf…` | DKIM. The key is new for this domain: copy it from Resend, don't reuse the root's |
   | CNAME | `send.updates` | `send.forge.rmta.net` (as Resend shows it) | Return path: carries the SPF and bounce MX, so SPF aligns with the From domain |
   | CNAME | `rsend.updates` | `rsend.forge.rmta.net` (as Resend shows it) | Second return path, as on the root |

   If Resend instead shows the older MX + TXT pair for `send.updates` (`MX 10 feedback-smtp.us-east-1.amazonses.com`, `TXT "v=spf1 include:amazonses.com ~all"`), add those. Use whatever the dashboard lists for this domain.
3. **DMARC**: nothing new is required. The root's `_dmarc` (`v=DMARC1; p=none;`) covers `updates.` because there is no `sp=`. Once a few weekly sends have passed cleanly, tightening the root to `p=quarantine` (or adding `_dmarc.updates` with `p=quarantine`) is what Microsoft 365 rewards. That is a separate decision.
4. Nothing at `updates` itself (no MX, no A): replies go to Reply-To, and the return-path records handle bounces.
5. Press **Verify** in Resend. Create a second sending-only API key scoped to `updates.catamountsublets.com` and set it as `RESEND_DIGEST_API_KEY` (Production, plus Preview if you want to send a test from a preview). `sendMail` uses it for the digest only; everything else keeps the root-scoped `RESEND_API_KEY`. Admin → Digest refuses to turn on while it is missing.
6. Then, in order: set `MAILING_ADDRESS` (the footer's postal address, read into `SITE.mailingAddress`; an env var because the repo is public) for the same environments and redeploy, Admin → **Digest** → pick an account → **Send a test to me** and check where it lands at a `uvm.edu` inbox, then **Turn on**.

## 6. Vercel Cron

`vercel.json`: `/api/cron/sweep` once a day at 09:20 UTC, authenticated by `CRON_SECRET`. Hobby allowed daily schedules only, with up to an hour of jitter; both were fine for a sweep.

`/api/cron/digest` every hour on the hour (needs Pro, which the project has been on since 12 Oct). Vercel runs in UTC, so the route itself decides: it acts only on the digest morning (`DIGEST.weekday`, `DIGEST.hour` Eastern, then `DIGEST.catchUpHours` catch-up hours) and only while Admin → Digest is on and nothing blocks it (`MAILING_ADDRESS`, `RESEND_DIGEST_API_KEY` and `SURVEY_SECRET` set). Every other firing returns `{acted: false}` at once. The full send runs only where `VERCEL_ENV` is `production`: a preview (or a laptop with a live key) answers `{reason: "not_production"}` and logs `digest.not_production`, whatever its database and switch say, so a preview can only send **Send a test to me** (to the signed-in admin; it also needs `SURVEY_SECRET` and `RESEND_DIGEST_API_KEY` set for Preview). A blocked run during the digest hour logs `digest.blocked` with the missing variable names.

## 7. Silk (legacy) — only at cutover prep, on explicit go-ahead

Deployed 8 October: legacy `main` carries the prep commits (root `.htaccess` `.sql` refusal, move-notice fixes, Instagram handle, the freeze rule commented out, the shim). Nothing else on Silk changes until cutover day.

Pulling on Silk, where `app/.htaccess` always carries a local change (the managed access block):

```bash
cp app/.htaccess <backup folder>/pre-pull-$(date -u +%Y%m%dT%H%M%SZ)
git stash && git pull --ff-only && git stash pop
git diff app/.htaccess                      # only the managed block may differ
curl -sI https://sublet.aperkel.w3.uvm.edu/app/ | grep -i location   # idp.uvm.edu
```

## 8. Hobby limits, checked against this app (8 October 2026)

| Resource | Hobby allowance | This app | Verdict |
|---|---|---|---|
| Function duration | 300 s default and maximum (Fluid) | photo processing ≤ 60 s, share cards < 5 s, migration and welcome mail run on Aaron's Mac | fine |
| Function memory | 2 GB | a 30 MB JPEG decodes to ~140 MB in sharp | fine |
| Request body | 4.5 MB | photos go browser → Blob by client upload; the function only mints the token | fine |
| Cron | daily only, ±59 min jitter | one daily sweep | fine |
| Blob storage | **1 GB** | nothing full-size is stored (8 Oct): three files per photo, ~300 KB; 196 migrated photos ≈ 60 MB; a semester adds ~60 MB; archiving deletes | fine |
| Blob advanced ops (put, copy, list, store create) | **2,000 / month** | the rehearsal wrote 784 files; the cutover sync `head()`s first and reuses them (0 writes); a new photo costs 4 (raw upload + 3 files) | ~300 new photos in the cutover month; a semester posts ~200 |
| Blob simple ops (cache-miss reads, `head`) | 10,000 / month | files are immutable, cached a year; the sync and `--verify` do ~600 `head`s each | fine |
| Blob data transfer | **10 GB / month** | Browse loads ≤ 43 thumbnails (~2 MB a fresh visitor), a listing view ~150 KB per photo | ~3 GB in a busy month; a viral week could exceed it |
| Over any Blob cap | Blob is **blocked for 30 days**, no overage billing | photos stop loading site-wide | the one real risk on Hobby; see below |
| Fast data transfer / edge requests | 100 GB, 1 M a month | small HTML pages, no CDN scripts | fine |
| Deployments | 100 / day, 1 concurrent build | — | fine |
| Logs | 1 hour retention | structured logs are for live debugging only | acceptable |
| Git | personal GitHub repos only | the repo is personal | fine |
| Terms | non-commercial use | a free student notice board with no revenue | fine |

**The Blob risk.** Three monthly caps (2,000 writes, 10 GB served, 1 GB stored)
block the store for 30 days when exceeded, which would take every photo off
the site. Decided 8 October: stay on Vercel Blob, store no originals, and
watch the Images tab's readout (stored bytes and an estimate of the month's
writes from the database; transfer is only on Vercel's Blob usage page). The
fallback if a cap is ever approached is Cloudflare R2 for the public `media`
store (free tier: 10 GB storage, 10 M reads a month, no egress charge): a new
driver in `src/server/storage/index.ts` and a CSP host change, about half a
day. Not built.
