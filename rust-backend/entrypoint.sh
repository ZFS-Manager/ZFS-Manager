#!/bin/sh
set -e

DATA_DIR="${ZFS_MANAGER_DATA:-/home/docker/zfs-manager}"

# Ensure the data directory exists with correct permissions on first start
if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
fi

# Touch a marker so we know the volume has been initialized
if [ ! -f "$DATA_DIR/.initialized" ]; then
    touch "$DATA_DIR/.initialized"
fi

exec /usr/local/bin/zfs-manager "$@"
