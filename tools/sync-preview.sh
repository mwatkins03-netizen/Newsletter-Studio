#!/bin/sh
# Copy the studio to /tmp for previewing (the Box sync path is not readable by local http servers).
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST=/tmp/newsletter-studio
mkdir -p "$DST" && rsync -a --delete --exclude tools --exclude '.DS_Store' "$SRC/" "$DST/" && echo "synced to $DST"
