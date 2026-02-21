#!/bin/bash
# Switch to Wix internal npm registry lock files
# Run this if you're a Wix employee with access to npm.dev.wixpress.com

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Switching to Wix internal registry..."

if [ -f "$ROOT_DIR/yarn.lock.wix-backup" ]; then
    cp "$ROOT_DIR/yarn.lock.wix-backup" "$ROOT_DIR/yarn.lock"
    echo "✓ Restored yarn.lock"
else
    echo "✗ yarn.lock.wix-backup not found"
    exit 1
fi

if [ -f "$ROOT_DIR/package-lock.json.wix-backup" ]; then
    cp "$ROOT_DIR/package-lock.json.wix-backup" "$ROOT_DIR/package-lock.json"
    echo "✓ Restored package-lock.json"
fi

echo ""
echo "Done! Now run: yarn install"
