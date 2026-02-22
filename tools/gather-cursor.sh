#!/bin/bash
# gather-cursor.sh — Run this on the Mac where Cursor CLI works
# It collects all Cursor auth/config files into a tarball you can transfer
set -euo pipefail

OUT_DIR="/tmp/cursor-export"
TARBALL="/tmp/cursor-export.tar.gz"

echo "🔍 Gathering Cursor CLI config and auth data..."
echo ""

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# 1. Cursor CLI config & auth
if [ -d "$HOME/.cursor" ]; then
    echo "✓ ~/.cursor/"
    mkdir -p "$OUT_DIR/dot-cursor"
    cp -R "$HOME/.cursor/" "$OUT_DIR/dot-cursor/" 2>/dev/null || true
fi

# 2. Cursor App Support (auth tokens, settings, state)
APP_SUPPORT="$HOME/Library/Application Support/Cursor"
if [ -d "$APP_SUPPORT" ]; then
    echo "✓ ~/Library/Application Support/Cursor/"
    mkdir -p "$OUT_DIR/app-support"
    # Auth-related files
    for f in "storage.json" "user-data" "AuthToken" "token" "cookies"; do
        if [ -e "$APP_SUPPORT/$f" ]; then
            cp -R "$APP_SUPPORT/$f" "$OUT_DIR/app-support/" 2>/dev/null || true
            echo "  → $f"
        fi
    done
    # User settings
    if [ -d "$APP_SUPPORT/User" ]; then
        mkdir -p "$OUT_DIR/app-support/User"
        for f in "settings.json" "keybindings.json" "globalStorage" "state"; do
            if [ -e "$APP_SUPPORT/User/$f" ]; then
                cp -R "$APP_SUPPORT/User/$f" "$OUT_DIR/app-support/User/" 2>/dev/null || true
                echo "  → User/$f"
            fi
        done
    fi
fi

# 3. Cursor Agent CLI specific config
AGENT_CONFIG="$HOME/.cursor-agent"
if [ -d "$AGENT_CONFIG" ]; then
    echo "✓ ~/.cursor-agent/"
    mkdir -p "$OUT_DIR/dot-cursor-agent"
    cp -R "$AGENT_CONFIG/" "$OUT_DIR/dot-cursor-agent/" 2>/dev/null || true
fi

# 4. Cursor compile cache (might contain auth state)
CACHE_DIR="$HOME/Library/Caches/cursor-compile-cache"
if [ -d "$CACHE_DIR" ]; then
    echo "✓ Compile cache exists (skipping — will rebuild)"
fi

# 5. Keychain tokens (export as text, can't copy keychain items directly)
echo ""
echo "🔑 Checking Keychain for Cursor tokens..."
mkdir -p "$OUT_DIR/keychain"
for label in "cursor" "Cursor" "cursor-agent" "cursor.com"; do
    security find-generic-password -l "$label" -g 2>"$OUT_DIR/keychain/${label}.txt" 2>/dev/null && echo "  → Found keychain entry: $label" || true
    security find-internet-password -l "$label" -g 2>>"$OUT_DIR/keychain/${label}.txt" 2>/dev/null || true
done
# Also search by service
for svc in "cursor-auth" "cursor.com" "api.cursor.com" "cursor-agent"; do
    security find-generic-password -s "$svc" -g 2>"$OUT_DIR/keychain/svc-${svc}.txt" 2>/dev/null && echo "  → Found keychain service: $svc" || true
done

# 6. Environment variables
echo ""
echo "🌍 Checking environment..."
mkdir -p "$OUT_DIR/env"
env | grep -iE 'cursor|CURSOR' > "$OUT_DIR/env/cursor-env.txt" 2>/dev/null || echo "(no CURSOR env vars)"

# 7. Cursor CLI binary info
echo ""
echo "📦 CLI binary info..."
mkdir -p "$OUT_DIR/binary-info"
which cursor-agent > "$OUT_DIR/binary-info/which.txt" 2>/dev/null || true
which agent >> "$OUT_DIR/binary-info/which.txt" 2>/dev/null || true
cursor-agent --version > "$OUT_DIR/binary-info/version.txt" 2>/dev/null || true
brew info cursor-cli > "$OUT_DIR/binary-info/brew-info.txt" 2>/dev/null || true

# 8. Node version used
echo "Node version (system): $(node --version 2>/dev/null || echo 'not found')" > "$OUT_DIR/binary-info/node-info.txt"
CURSOR_NODE="$(dirname "$(realpath "$(which cursor-agent)" 2>/dev/null || echo /dev/null)")/node"
if [ -x "$CURSOR_NODE" ]; then
    echo "Node version (bundled): $("$CURSOR_NODE" --version)" >> "$OUT_DIR/binary-info/node-info.txt"
fi

# Create tarball
echo ""
echo "📦 Creating tarball..."
tar -czf "$TARBALL" -C /tmp cursor-export

echo ""
echo "✅ Done! Transfer this file to your other Mac:"
echo ""
echo "   $TARBALL ($(du -h "$TARBALL" | cut -f1))"
echo ""
echo "   scp $TARBALL youruser@other-mac:/tmp/"
echo ""
echo "Then run the restore script on the other Mac."
