#!/usr/bin/env bash
#
# Encrypted logical backup of the SpreddPay database.
#
# The Railway plan in use reports maxBackupsCount: 0, so there are no
# provider-side snapshots. For a platform whose ledger and audit trail are
# append-only by design, losing the volume would be unrecoverable — the
# application-level guards protect against bugs, not against storage loss.
#
# Produces: spreddpay-<utc-timestamp>.sql.gz.enc
#   pg_dump -> gzip -> AES-256 (openssl enc, PBKDF2)
#
# Restore with scripts/restore.sh.
#
# Required:
#   DATABASE_URL       postgres connection string (public host, not *.internal)
#   BACKUP_PASSPHRASE  symmetric key for encryption
#
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required — an unencrypted backup of financial data is not acceptable}"

OUT_DIR="${BACKUP_OUT_DIR:-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${OUT_DIR}/spreddpay-${STAMP}.sql.gz.enc"

mkdir -p "$OUT_DIR"

echo "Dumping database…"
# --no-owner / --no-privileges so the dump restores into a differently-owned
# database (a fresh Railway instance, or a local one) without role errors.
pg_dump "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
| gzip -9 \
| openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
  -out "$FILE"

SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 1024 ]; then
  echo "Backup is only ${SIZE} bytes — that is not a real dump. Failing." >&2
  exit 1
fi

echo "Wrote $FILE (${SIZE} bytes)"

# Prove the artefact decrypts and looks like a dump before calling it a backup.
# A backup that has never been read is a hope, not a backup.
echo "Verifying…"
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" \
   | gzip -dc | head -c 4000 | grep -q 'PostgreSQL database dump'; then
  echo "Verified: decrypts and contains a PostgreSQL dump header."
else
  echo "Verification FAILED — the artefact does not decrypt to a valid dump." >&2
  exit 1
fi

echo "$FILE"
