#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PG_BIN="$APP_DIR/.local/postgres/bin"
TEST_DIR="$APP_DIR/.local/pg-tests"
RESTORE_DB="ch_runtime_restore_$$"
DUMP_FILE="$TEST_DIR/runtime-restore-$$.dump"

cleanup() {
  if [ -x "$PG_BIN/dropdb" ] && DATABASE_URL=$($SCRIPT_DIR/pg-url 2>/dev/null); then
    "$PG_BIN/dropdb" --if-exists --maintenance-db="$DATABASE_URL" "$RESTORE_DB" >/dev/null 2>&1 || true
    "$PG_BIN/psql" "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS runtime_persistence_probe' >/dev/null 2>&1 || true
  fi
  if [ -f "$DUMP_FILE" ]; then
    rm -f -- "$DUMP_FILE"
  fi
}
trap cleanup EXIT INT TERM

for tool in postgres initdb pg_ctl psql createdb dropdb pg_dump pg_restore; do
  test -x "$PG_BIN/$tool" || {
    echo "missing PostgreSQL tool: $PG_BIN/$tool" >&2
    exit 1
  }
done

mkdir -p "$TEST_DIR"
"$SCRIPT_DIR/pg-start" >/dev/null
DATABASE_URL=$($SCRIPT_DIR/pg-url)

VERSION=$($PG_BIN/psql "$DATABASE_URL" -Atqc 'select version()')
case "$VERSION" in
  PostgreSQL\ *) ;;
  *) echo "unexpected version output: $VERSION" >&2; exit 1 ;;
esac

SERVER_ADDR=$($PG_BIN/psql "$DATABASE_URL" -Atqc 'select host(inet_server_addr())')
test "$SERVER_ADDR" = "127.0.0.1" || {
  echo "server is not bound to 127.0.0.1: $SERVER_ADDR" >&2
  exit 1
}

$PG_BIN/psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP TABLE IF EXISTS runtime_persistence_probe;
CREATE TABLE runtime_persistence_probe (value text PRIMARY KEY);
INSERT INTO runtime_persistence_probe VALUES ('survives-restart');
SQL

"$SCRIPT_DIR/pg-stop" >/dev/null
"$SCRIPT_DIR/pg-start" >/dev/null
DATABASE_URL=$($SCRIPT_DIR/pg-url)

PERSISTED=$($PG_BIN/psql "$DATABASE_URL" -Atqc "select value from runtime_persistence_probe")
test "$PERSISTED" = "survives-restart" || {
  echo "row did not survive restart" >&2
  exit 1
}

$PG_BIN/pg_dump --format=custom --file="$DUMP_FILE" "$DATABASE_URL"
$PG_BIN/createdb --maintenance-db="$DATABASE_URL" "$RESTORE_DB"
RESTORE_URL=$(printf '%s' "$DATABASE_URL" | sed "s,/couple_home$,/$RESTORE_DB,")
$PG_BIN/pg_restore --no-owner --no-privileges --dbname="$RESTORE_URL" "$DUMP_FILE"
RESTORED=$($PG_BIN/psql "$RESTORE_URL" -Atqc "select value from runtime_persistence_probe")
test "$RESTORED" = "survives-restart" || {
  echo "restored database does not contain expected row" >&2
  exit 1
}

$PG_BIN/dropdb --maintenance-db="$DATABASE_URL" "$RESTORE_DB"
$PG_BIN/psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'DROP TABLE runtime_persistence_probe' >/dev/null
rm -f -- "$DUMP_FILE"
trap - EXIT INT TERM

printf 'version=%s\n' "$VERSION"
printf 'server_addr=%s\n' "$SERVER_ADDR"
printf 'restart_persistence=ok\n'
printf 'dump_restore=ok\n'
printf 'database_url=%s\n' "$DATABASE_URL"
