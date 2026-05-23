#!/usr/bin/env bash
# Weekly Postgres backup → S3.
#
# Invoked by .github/workflows/backup-pg.yml. Kept as a separate script so
# it's runnable from any operator's machine in a pinch (just export the
# same env vars and run it).
#
# Required env:
#   DATABASE_URL        — postgres:// URL. The workflow injects this from
#                         the DATABASE_URL repo secret (Railway's
#                         DATABASE_PUBLIC_URL value).
#   FOLDO_BACKUP_BUCKET — S3 bucket name (no s3:// prefix).
#   AWS_*               — picked up by aws-cli from env / credential
#                         provider chain. The workflow sets them via
#                         aws-actions/configure-aws-credentials.
#
# Outputs (GITHUB_OUTPUT when run in Actions):
#   object_key  — S3 key of the uploaded dump, used by the verification step.
#
# Format: --format=custom is binary, compressible, and pg_restore-friendly.
# Retention: handled by an S3 lifecycle policy on the bucket — this script
# does NOT delete old dumps; that's the bucket's job (8 weekly + 12
# monthly, per docs/DEPLOYMENT.md §7.2).
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${FOLDO_BACKUP_BUCKET:?FOLDO_BACKUP_BUCKET is required}"

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
DUMP_FILE="/tmp/foldo-pg-${STAMP}.dump"
OBJECT_KEY="postgres/foldo-pg-${STAMP}.dump"

echo "==> pg_dump → ${DUMP_FILE}"
# --format=custom: pg_restore-friendly, compressed.
# --no-owner / --no-privileges: portable across roles (so we can restore
# into a scratch DB that doesn't have the same role names).
# --verbose to stderr — useful when this fails and we're reading the GH log.
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="${DUMP_FILE}" \
  "${DATABASE_URL}"

SIZE_BYTES=$(stat -c %s "${DUMP_FILE}" 2>/dev/null || stat -f %z "${DUMP_FILE}")
echo "==> dump size: ${SIZE_BYTES} bytes"

if [ "${SIZE_BYTES}" -lt 1024 ]; then
  echo "::error::dump is suspiciously small (<1 KiB) — bailing before upload"
  exit 1
fi

echo "==> uploading to s3://${FOLDO_BACKUP_BUCKET}/${OBJECT_KEY}"
aws s3 cp "${DUMP_FILE}" "s3://${FOLDO_BACKUP_BUCKET}/${OBJECT_KEY}" \
  --content-type application/octet-stream \
  --metadata "stamp=${STAMP},source=github-actions,workflow=backup-pg"

# Clean up the local dump so the runner's disk isn't carrying a copy.
rm -f "${DUMP_FILE}"

# Emit the object key for the workflow's verification step. GITHUB_OUTPUT
# is only set when running under Actions — guard so local runs still work.
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "object_key=${OBJECT_KEY}" >> "${GITHUB_OUTPUT}"
fi

echo "==> done"
