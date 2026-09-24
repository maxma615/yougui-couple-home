#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."

# This named integration case creates both source and target as isolated ch_
# databases and uses new temporary attachment directories. It never restores
# over the development database or development attachment directory.
npm test -- tests/integration/backup-restore.test.ts \
  -t "restores M2 records, calendar events, active photos and pending cleanup state into an empty target"
