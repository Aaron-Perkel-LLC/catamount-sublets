# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Catamount Sublets (catamountsublets.com): students post one sublet listing each and browse the others by price, semester, distance from campus and amenities, on a grid or a map. Anyone can browse without signing in, seeing an approximate area and no address, poster or contact (unless the poster keeps the listing to signed-in students); signing in shows the rest. Listings can also be shared through a public preview link. It replaces "UVM Sublets", a PHP app on UVM hosting whose code is linked read-only at `sublets-legacy/` for reference. **`PLAN.md` is the migration plan and the status board**; keep its Status table current when a phase changes state.

Stack: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, npm, `src/`. Neon Postgres through Drizzle (`casing: "snake_case"`, migrations in `drizzle/`). better-auth with the email-OTP and admin plugins. Resend for mail. Two Vercel Blob stores (private `uploads`, public `media`). MapLibre GL. vitest + PGlite for tests.

## Commands

```bash
npm run dev
npm run build        # gate 1: typecheck + build
npm test             # gate 2: vitest, in-process PGlite Postgres
npm run lint
npm run db:generate  # drizzle-kit: schema → drizzle/NNNN_*.sql (read the SQL before committing)
npm run db:migrate   # applies migrations to DATABASE_URL_UNPOOLED
npm run email:dev    # react-email preview on :3001
```

## Hard rules

1. **Ask before anything external or irreversible**: sending email, DNS, the Silk server or its database, writes to the production database, buying or upgrading a plan, deleting data anywhere.
2. **No real user data in the repo.** `*.sql`, `.env*` (except `.env.example`), `legacy-images/`, `opt-outs.txt` are gitignored; the migration inputs lived in a private folder outside every checkout. Check `git status` before every commit.
3. **No PII in logs.** `no-console` is an ESLint error under `src/`; `src/server/log.ts` takes ids, never emails, codes or contact fields. Next.js server-function logging is off in `next.config.ts`.
4. **Names and addresses come from `src/config/site.ts`.** (The one exception is the digest footer's postal address: the `MAILING_ADDRESS` env var, read only in the `server-only` `src/server/digest-config.ts`, because the repo is public.) Never spell out the product name, domain, mail addresses or the Instagram handle in code or templates. Nothing may say "UVM", "NetID" or "CAS" outside that file and the sign-in copy that explains the address rule.
5. **Who may sign in is `assertEmailAllowed()`**, called from the better-auth before-hook on the send-code endpoints *and* from the user-create database hook. Both, always.
6. **Authorisation lives in the data-access layer.** Every mutating function takes the acting user's id and filters by it; a zero-row update is a 404. `requireAdmin()` is the first line of every admin action.
7. **Every input is a zod schema** shared by the Server Action and the form.
8. **Photos**: raw uploads go to the private store; only sharp output (ICC kept, everything else stripped) reaches the public store. The server chooses pathnames. Never serve a raw upload.
9. **The public surface is `toPublicListing()`** (`PublicListing` in `src/server/data/public-listings.ts`: price, negotiable, semester, size, utilities, amenities, posted N days ago, photos, generated title, neighborhood, distance from the approximate area and the ~150 m area itself; never the description or anything derived from it). The area is keyed by the place (`fuzzedArea(lat, lon)`, a 50 m grid cell), never the listing, so listings in one house share it. Every signed-out path (pages, client props, route handlers, map data, sitemap, metadata) takes `PublicListing`, never `ListingDto`, and signed-out queries go through `listingFilterWhere(…, "signed-out")`. `shareCardLines()` is its share-card subset (price, negotiable, semester, size, distance); it goes out for signed-in-only listings too, so it must not grow. Adding a field to either publishes it.
10. **Dates are Eastern where the product says a "day"**: event dedupe keys, "posted N days ago", the activity chart's buckets. `src/lib/dates.ts` pins `America/New_York`; Vercel runs UTC.

## Conventions

- Server-only modules under `src/server/`; `src/lib/` is safe for both sides.
- Mutations are Server Actions in `src/server/actions/`; Route Handlers only for the beacon, uploads, auth, the share-card image, the crons and the digest's RFC 8058 one-click unsubscribe (a POST from the mail provider, so it can't be a Server Action).
- The weekly digest matches through `newBoardListings()`, which is Browse's own query narrowed by date and owner, and saved searches store Browse's query string. Never add a second filter path or format, or the email and the site disagree. Digest listings show `shareCardLines()` fields only.
- Data access in `src/server/data/`, one module per table family, returning DTOs that never include another user's email or id.
- Tests next to the code as `*.test.ts`; data tests boot PGlite and run the real migrations (`src/db/test-db.ts`).
- Commit messages: imperative, one line of what and why.
