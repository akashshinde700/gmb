#!/usr/bin/env bash
#
# WebSetu — automatic database backups.
#
# The deploy script deliberately takes none, and customers are deleted from the
# admin console with a single click, so without this there is nothing to go back
# to. Run with --install (as root) and it keeps a rolling set of snapshots.
#
#   sudo bash server/backup-db.sh --install
#   sudo bash server/backup-db.sh            # take one now
#   sudo bash server/backup-db.sh --list
#
# Snapshots use SQLite's own .backup, which is safe to run against a live
# database — a plain file copy of a database being written to can be corrupt.
set -uo pipefail

DB="${DB:-/home/websetu/persistent/websetu.db}"
DEST="${DEST:-/home/websetu/persistent/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
OWNER="${OWNER:-websetu:websetu}"
LOG_TAG="websetu-backup"

log() { echo "[$(date '+%F %T')] $*"; logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" = "0" ] || die "run as root"

install_self() {
  install -D -m 755 "$(readlink -f "$0")" /usr/local/sbin/websetu-backup
  cat >/etc/systemd/system/websetu-backup.service <<EOF
[Unit]
Description=WebSetu database snapshot

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/websetu-backup
EOF
  cat >/etc/systemd/system/websetu-backup.timer <<'EOF'
[Unit]
Description=Snapshot the WebSetu database twice a day

[Timer]
OnCalendar=*-*-* 02,14:30:00
Persistent=true
AccuracySec=5min

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now websetu-backup.timer >/dev/null
  log "installed — snapshots at 02:30 and 14:30, keeping the last ${KEEP_DAILY}"
}

case "${1:-}" in
  --install) install_self; exit 0 ;;
  --list)    ls -lah "$DEST" 2>/dev/null | tail -20; exit 0 ;;
  "")        : ;;
  *)         die "unknown option $1" ;;
esac

[ -f "$DB" ] || die "no database at $DB"
mkdir -p "$DEST"

OUT="$DEST/websetu-$(date '+%Y%m%d-%H%M%S').db"
if ! sqlite3 "$DB" ".backup '$OUT'"; then
  rm -f "$OUT"
  die "snapshot failed"
fi

# A snapshot that cannot be opened is worse than none, because it looks like
# cover that is not there.
if ! sqlite3 "$OUT" "pragma quick_check;" | grep -q '^ok$'; then
  rm -f "$OUT"
  die "snapshot failed its integrity check — discarded"
fi

gzip -9 "$OUT"
chown "$OWNER" "$OUT.gz" 2>/dev/null || true
chmod 640 "$OUT.gz"
rows=$(sqlite3 "$DB" "select (select count(*) from Business) || ' businesses, ' || (select count(*) from User) || ' users';")
log "saved $(basename "$OUT.gz") ($(du -h "$OUT.gz" | cut -f1)) — $rows"

# Keep the newest N, drop the rest.
mapfile -t old < <(ls -1t "$DEST"/websetu-*.db.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)))
for f in "${old[@]:-}"; do
  [ -n "$f" ] && rm -f "$f" && log "pruned $(basename "$f")"
done
exit 0
