# Migrating from UVM Sublets

PLAN.md §3 is the design. Everything here runs from the repo root. Inputs live
in a private folder outside every checkout (`$WORK` below): the dump, the
rsynced originals, `opt-outs.txt`, and the deletion log. They are real user
data and never enter the repo.

## Rehearsal (dump → a Neon branch, or local PGlite)

```bash
# 1. The legacy secret candidates and one real share URL from the old site,
#    so the script can tell which secret is in use (never stored anywhere).
export LEGACY_SHARE_SECRET='…'      # from the Silk .env, if set
export LEGACY_DBPASS='…'            # the fallback the old site used otherwise
export LEGACY_SHARE_SAMPLE='https://sublet.aperkel.w3.uvm.edu/s/<id>-<token>'

# 2. Target: a Neon branch (DATABASE_URL) or local PGlite (leave it unset).
export DATABASE_URL='postgres://…'  # omit for PGlite in .pglite/
export BLOB_MEDIA_READ_WRITE_TOKEN='…' BLOB_UPLOADS_READ_WRITE_TOKEN='…'   # omit for .uploads/ on disk

# 3. Dry run: prints the plan, warnings and the verification report; writes nothing.
npm run migrate:legacy -- --dump $WORK/dumps/<dump>.sql \
  --images-dir $WORK/legacy-images --opt-outs $WORK/opt-outs.txt

# 4. Apply rows and photos, then verify (downloads each original to compare hashes).
npm run migrate:legacy -- --dump … --images-dir … --opt-outs … --apply --images --verify --fetch-images
```

## Final sync (live MySQL → production)

Only on the cutover day, after the freeze, on an explicit go-ahead.

```bash
ssh -N -L 3306:<legacy MySQL host>:3306 <user>@<silk host> &     # tunnel
rsync -av <user>@<silk host>:<docroot>/public/images/ $WORK/legacy-images/ \
  --exclude='*_display.webp' --exclude='*_thumb.webp'

npm run migrate:legacy -- --source mysql --mysql-url 'mysql://user:pass@127.0.0.1:3306/db' \
  --images-dir $WORK/legacy-images --opt-outs $WORK/opt-outs.txt            # dry run; read it
npm run migrate:legacy -- --source mysql --mysql-url '…' --images-dir … --opt-outs … \
  --apply --images --prune --verify --fetch-images
```

`--prune` refuses to run once anyone has signed in to the target or posted
there, so it can only be the last run before the gate opens.

## Honouring an opt-out after the migration

```bash
npm run delete-user -- jsmith@uvm.edu          # dry run: what would go
npm run delete-user -- jsmith@uvm.edu --apply  # deletes; appends to the deletions log (DELETIONS_LOG)
```
