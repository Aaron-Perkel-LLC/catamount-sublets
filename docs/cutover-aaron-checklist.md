# Cutover: Aaron's own steps

Friday 9 October 2026, 7:00 am ET. Everything here is yours; the rest of the
runbook is run from the Mac on your go-ahead. Set these once in the Silk
shell and once in the Mac shell:

```bash
SILK=<user>@<silk host>
PARENT=<home directory on Silk>
SITE=<docroot directory>                 # the git checkout that is the document root
DOCROOT=$PARENT/$SITE
BACKUPS=<.htaccess backup folder on Silk>
WORK=<private folder on the Mac, outside every checkout>   # dumps, originals, opt-outs
```

## 0. Done Thursday night: Silk has the latest legacy code

Legacy `main` pushed, Silk pulled (`git stash && git pull --ff-only && git stash pop`),
Silk HEAD `1256de1` = origin/main, `git status` clean, shim matches GitHub, six
`R=302` rules, `/app/` still redirects to idp.uvm.edu. Nothing to repeat Friday
unless the legacy repo changes again.

## 1. Banner first, then freeze (the freeze blocks the banner save)

In the legacy admin, Announcement tab, style **warning**, publish:

> UVM Sublets is read-only while it moves to catamountsublets.com. Back in about an hour.

Then on Silk:

```bash
ssh $SILK
cd $DOCROOT
cp app/.htaccess $BACKUPS/pre-freeze-$(date -u +%Y%m%dT%H%M%SZ)
sed -i -E 's/^# (RewriteCond %\{REQUEST_METHOD\} !\^\(GET\|HEAD\)\$)$/\1/; s/^# (RewriteRule \^ - \[R=503,L\])$/\1/' app/.htaccess
grep -n -B1 'R=503' app/.htaccess      # both lines must now start with "Rewrite", not "# "
```

Check from a browser where you are signed in: pages still load; the Announcement
tab's Save now fails (503). That is the freeze working. Nothing is ever sent
through UVM's relay or from your UVM address.

## 2. Export the frozen database

phpMyAdmin → the legacy database → **Export** → Custom → format SQL,
tables all, "Structure and data", same options as the 8 October export.
Save as `$WORK/dumps/legacy-2026-10-09.sql`, then on the Mac:

```bash
chmod 600 $WORK/dumps/legacy-2026-10-09.sql
grep -n 'SET time_zone = "+00:00"' $WORK/dumps/legacy-2026-10-09.sql   # must print line ~12
grep -c "INSERT INTO \`sublets\`" $WORK/dumps/legacy-2026-10-09.sql    # 1
```

If the time-zone line is missing, export again with the default SQL options;
phpMyAdmin 5.2 writes it by itself.

## 3. Re-sync the originals

```bash
rsync -av --exclude='*_display.webp' --exclude='*_thumb.webp' \
  $SILK:$DOCROOT/public/images/ $WORK/legacy-originals/
ls $WORK/legacy-originals | grep -cE '^[0-9a-f]{32}\.[a-z]+$'   # originals count; 199 on 8 October
```

## 4. Opt-outs

One NetID or email per line, nothing else:

```bash
chmod 600 $WORK/opt-outs.txt
cat $WORK/opt-outs.txt
```

Two more files in the same folder, both optional, one address per line:

```bash
$WORK/suppressed.txt   # every address on Resend's suppression list (dashboard → Suppressions); the script cannot read it
$WORK/skip.txt         # anyone you decide not to write to
```

No `RESEND_ADMIN_API_KEY`: the welcome send runs with `--without-bounce-check`
(decided 8 Oct; every recipient was active this year). Keep Resend's dashboard
open while it runs. The welcome test message is done (it landed in Inbox).

Do not sign in on catamountsublets.com before the apply: a sign-in writes
rows to the production database, which must be empty for the import.

For the smoke test after the shim you are the non-admin tester: sign in with
your own `@uvm.edu` address. That makes a fresh ordinary account with no
NetID; your legacy NetID maps to the admin address, which has no listing. The smoke test includes the production map: OpenFreeMap, not the
Esri fallback.

Tell me the files are final. Then I run the dry run, you approve the restore
point, the apply, and the soft open.

## 5. The shim (after the soft open passes)

```bash
ssh $SILK
cd $DOCROOT && git diff --quiet origin/main -- shim/.htaccess && echo "shim matches GitHub"   # must print; otherwise stop
cd $PARENT
mv $SITE $SITE.off && mkdir $SITE && cp $SITE.off/shim/.htaccess $SITE/
ls -la $SITE                                                                      # only .htaccess
curl -sI https://sublet.aperkel.w3.uvm.edu/ | grep -iE '^(HTTP|location)'       # 302 → https://catamountsublets.com/
curl -sI https://sublet.aperkel.w3.uvm.edu/s/<id>-<token> | grep -i location   # → catamountsublets.com/s/<id>-<token>
```

The old tree, `public/images/` included, stays at `$PARENT/$SITE.off` for the
rollback window.

## Rollback, if I ask for it (within 48 hours)

```bash
ssh $SILK
cd $PARENT
mv $SITE $SITE.broken && mv $SITE.off $SITE
sed -i -E 's/^(RewriteCond %\{REQUEST_METHOD\})/# \1/; s/^(RewriteRule \^ - \[R=503,L\])/# \1/' $SITE/app/.htaccess
grep -n -B1 'R=503' $SITE/app/.htaccess   # both lines commented again
```

Then clear the banner in the legacy admin.

## If Resend cannot be used for the welcome mail

Nothing goes through UVM's relay. The fallback is you, from
aaron@catamountsublets.com in iCloud Mail, BCC, 15 at a time. The recipient
files come from the production database after the apply (Friday) and hold
real addresses, so they live outside every checkout and go away afterwards:

```bash
DATABASE_URL="$(neonctl connection-string main --project-id <project-id> --database-name <database> --pooled)" npm run welcome-batches
ls <output folder>/welcome-batches/             # batch-01.csv … (email,first_name,listing_id); the script prints where
node --import tsx scripts/admin/render-welcome.ts   # the plain-text body to paste
rm -r <output folder>/welcome-batches/              # after the last batch
```

## Later

- Sunday 11 October (T+2 d): in `$PARENT/$SITE/.htaccess` change every `R=302` to `R=301` and delete the `Header always set Cache-Control` line.
- Friday 16 October (T+7 d): decommission per PLAN.md §6.5, on its own go-ahead.
- Thursday 7 January 2027 (T+90 d): the short link and the shim go the same day,
  link first so it never lands on a dead page. Nothing else of the app is left
  on UVM infrastructure afterwards.

  1. Delete `go.uvm.edu/sublet` in go.uvm.edu's own list of your links (sign in
     with your NetID). If it offers no delete, send `docs/go-uvm-link-request.md`
     instead.
  2. Remove the shim:

     ```bash
     ssh $SILK
     cd $PARENT
     ls -la $SITE                          # only .htaccess, six R=301 rules
     rm -- $SITE/.htaccess && rmdir $SITE
     ls -d $PARENT/$SITE 2>&1              # No such file or directory
     ```

  3. Check, from the Mac:

     ```bash
     curl -sI https://go.uvm.edu/sublet | grep -iE '^(HTTP|location)'                  # no Location to the old site or catamountsublets.com
     curl -sI https://sublet.aperkel.w3.uvm.edu/ | grep -iE '^(HTTP|location)'         # 404 or Silk's default page, no Location
     ```

  Then mark PLAN.md Status row 12 done.
