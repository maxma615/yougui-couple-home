#!/bin/sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
PG_ROOT="$APP_DIR/.local/postgres"
PG_BIN="$PG_ROOT/bin"
PG_DATA="$APP_DIR/.local/pgdata"
PG_LOG_DIR="$APP_DIR/.local/pglogs"
PG_SOCKET_DIR="$APP_DIR/.local/pgsocket"
PG_PORT_FILE="$APP_DIR/.local/pg-port"
PG_DEFAULT_PORT=${PG_PORT:-55432}
PG_DATABASE=couple_home
PG_USER=postgres

export PATH="$PG_BIN:$PATH"

require_postgres_runtime() {
  for tool in postgres initdb pg_ctl psql createdb dropdb pg_dump pg_restore; do
    if [ ! -x "$PG_BIN/$tool" ]; then
      echo "PostgreSQL runtime is incomplete: missing $PG_BIN/$tool" >&2
      return 1
    fi
  done
}

postgres_is_running() {
  [ -s "$PG_DATA/PG_VERSION" ] && "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1
}

port_is_listening() {
  /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

read_recorded_port() {
  if [ -s "$PG_PORT_FILE" ]; then
    recorded_port=$(sed -n '1p' "$PG_PORT_FILE")
    case "$recorded_port" in
      ''|*[!0-9]*) return 1 ;;
      *) printf '%s\n' "$recorded_port" ;;
    esac
  else
    return 1
  fi
}

choose_available_port() {
  candidate=$PG_DEFAULT_PORT
  limit=$((PG_DEFAULT_PORT + 100))
  while [ "$candidate" -le "$limit" ]; do
    if ! port_is_listening "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    candidate=$((candidate + 1))
  done
  echo "No free PostgreSQL port found in $PG_DEFAULT_PORT-$limit" >&2
  return 1
}

database_url_for_port() {
  printf 'postgresql://%s@127.0.0.1:%s/%s\n' "$PG_USER" "$1" "$PG_DATABASE"
}

maintenance_url_for_port() {
  printf 'postgresql://%s@127.0.0.1:%s/postgres\n' "$PG_USER" "$1"
}
