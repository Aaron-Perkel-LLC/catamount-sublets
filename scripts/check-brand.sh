#!/usr/bin/env bash
# The old brand must not leak into the app. Words that name the university,
# its sign-in, or its mascot may appear only where the product genuinely
# refers to the allowed email domain: the config, the allow rule, the sign-in
# copy, and the legacy migration tooling (which is about the old site).
set -euo pipefail
cd "$(dirname "$0")/.."

pattern='uvm|\bnetid\b|net id|fellow catamount|catamounts\b|\bcas\b|silk'
allow='^(src/config/site\.ts|src/lib/auth-allow\.ts|src/app/sign-in/sign-in-form\.tsx|src/emails/welcome\.tsx|scripts/migrate-legacy/.*|scripts/admin/.*|.*\.test\.tsx?)$'

hits=$(grep -rniE "$pattern" src scripts --include='*.ts' --include='*.tsx' --include='*.css' --include='*.svg' -l 2>/dev/null | grep -vE "$allow" || true)
if [ -n "$hits" ]; then
  echo "Old-brand wording found outside the allowed files:"
  for f in $hits; do
    grep -niE "$pattern" "$f" | sed "s|^|  $f:|"
  done
  exit 1
fi
echo "brand check: clean"
