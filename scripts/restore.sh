#!/usr/bin/env bash
#
# Restore an encrypted SpreddPay backup.
#
#   BACKUP_PASSPHRASE=… RESTORE_DATABASE_URL=… scripts/restore.sh backups/spreddpay-….sql.gz.enc
#
# Deliberately refuses to write to DATABASE_URL. Restores go to an explicitly
# named RESTORE_DATABASE_URL so that "run the restore script" can never be the
# thing that destroys production.
#
set -euo pipefail

FILE="${1:?usage: restore.sh <backup-file.sql.gz.enc>}"

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required — set it to the TARGET database, which must not be production}"

if [ ! -f "$FILE" ]; then
  echo "No such backup: $FILE" >&2
  exit 1
fi

if [ "${RESTORE_DATABASE_URL}" = "${DATABASE_URL:-}" ]; then
  echo "RESTORE_DATABASE_URL is the same as DATABASE_URL. Refusing." >&2
  echo "Restore into a new database, verify it, then repoint the application." >&2
  exit 1
fi

echo "Restoring $FILE"
echo "  into ${RESTORE_DATABASE_URL%%\?*}"
echo

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
| gzip -dc \
| psql "$RESTORE_DATABASE_URL" --set ON_ERROR_STOP=on --quiet

echo
echo "Restored. Verify before repointing anything:"
echo "  psql \"\$RESTORE_DATABASE_URL\" -c 'SELECT count(*) FROM \"Payout\";'"
echo "  psql \"\$RESTORE_DATABASE_URL\" -c 'SELECT count(*) FROM \"AuditEvent\";'"
echo "  psql \"\$RESTORE_DATABASE_URL\" -c 'SELECT count(*) FROM \"LedgerPosting\";'"
