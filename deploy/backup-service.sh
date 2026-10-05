#!/bin/sh
set -eu

release=/srv/yougui/current
destination=/srv/yougui/backups/automatic
mkdir -p "$destination"
chown 10001:10001 "$destination"
chmod 750 "$destination"
cd "$release"
exec sh scripts/backup.sh "$destination"
