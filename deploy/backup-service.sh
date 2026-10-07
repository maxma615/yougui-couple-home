#!/bin/sh
set -eu

# The owner explicitly disabled backups on 2026-10-07.
# This marker lives outside release directories so upgrades preserve it.
if [ -f /srv/yougui/config/backups-disabled ]; then
  echo "Backups disabled by the owner."
  exit 0
fi

release=/srv/yougui/current
destination=/srv/yougui/backups/automatic
mkdir -p "$destination"
chown 10001:10001 "$destination"
chmod 750 "$destination"
cd "$release"
exec sh scripts/backup.sh "$destination"
