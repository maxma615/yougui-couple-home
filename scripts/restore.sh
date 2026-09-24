#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/restore.sh COMPLETED_BACKUP_DIRECTORY" >&2
  exit 2
fi

case "$1" in
  *"/../"*|../*|*/..|..)
    echo "Backup path must not contain parent traversal" >&2
    exit 2
    ;;
esac
if [ -L "$1" ] || [ ! -d "$1" ]; then
  echo "Backup path must be a real directory" >&2
  exit 2
fi

project_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
backup_dir=$(CDPATH= cd -- "$1" && pwd -P)
maintenance_host_dir=$(dirname "$backup_dir")
backup_name=$(basename "$backup_dir")
cd "$project_dir"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required for the Compose restore wrapper" >&2
  exit 1
}
docker compose version >/dev/null

configured_services=$(docker compose --profile maintenance config --services)
running_services=$(docker compose --profile maintenance ps --services --filter status=running)
resume_services=""

contains_line() {
  printf '%s\n' "$1" | grep -Fx "$2" >/dev/null 2>&1
}

for service in app photo-cleanup caddy; do
  if contains_line "$configured_services" "$service" && contains_line "$running_services" "$service"; then
    resume_services="$resume_services $service"
  fi
done

restore_services() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ -n "$resume_services" ]; then
    if ! docker compose start $resume_services; then
      echo "Restore ended but the previous service state could not be restarted" >&2
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  exit "$status"
}
trap restore_services EXIT HUP INT TERM

if [ -n "$resume_services" ]; then
  docker compose stop $resume_services
fi

remaining=$(docker compose --profile maintenance ps --services --filter status=running)
for service in $remaining; do
  if [ "$service" != "db" ]; then
    echo "Refusing restore while unexpected service '$service' is running" >&2
    exit 1
  fi
done

MAINTENANCE_HOST_DIR="$maintenance_host_dir" \
  docker compose --profile maintenance run --rm -T maintenance \
  node_modules/.bin/tsx src/cli/restore.ts "/backups/$backup_name"
