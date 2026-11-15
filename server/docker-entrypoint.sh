#!/bin/sh
# Start the relay as the unprivileged "relay" user (uid 10001).
# Fly mounts the volume at $DATA_DIR owned by root, so while still root, hand it to that user
# (only when it isn't already: a full chown of a big volume on every start would be slow).
set -e
DIR="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DIR"
  if [ "$(stat -c %u "$DIR")" != "10001" ]; then
    chown -R 10001:10001 "$DIR"
  fi
  exec setpriv --reuid=10001 --regid=10001 --init-groups "$@"
fi
exec "$@"
