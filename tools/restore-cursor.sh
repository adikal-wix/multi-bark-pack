#!/bin/bash
# restore-cursor.sh — Run this on the Mac where Cursor CLI is broken
# Restores config/auth from the tarball gathered on the working Mac
set -euo pipefail

TARBALL="${1:-/tmp/cursor-export.tar.gz}"

if [ ! -f "$TARBALL" ]; then
    echo "❌ Tarball not found: $TARBALL"
    echo "Usage: ./restore-cursor.sh /path/to/cursor-export.tar.gz"
    exit 1
fi

echo "🔧 Restoring Cursor CLI config and auth..."
echo ""

# Extract
EXTRACT_DIR="/tmp/cursor-export"
rm -rf "$EXTRACT_DIR"
tar -xzf "$TARBALL" -C /tmp

# 1. Restore ~/.cursor/
if [ -d "$EXTRACT_DIR/dot-cursor" ]; then
    echo "→ Restoring ~/.cursor/"
    # Don't overwrite projects/ (local to this machine)
    for item in "$EXTRACT_DIR/dot-cursor/"*; do
        name="$(basename "$item")"
        if [ "$name" != "projects" ] && [ "$name" != "skills" ] && [ "$name" != "skills-cursor" ]; then
            cp -R "$item" "$HOME/.cursor/$name" 2>/dev/null || true
            echo "  ✓ $name"
        else
            echo "  ⊘ $name (skipped, local)"
        fi
    done
fi

# 2. Restore Application Support
APP_SUPPORT="$HOME/Library/Application Support/Cursor"
if [ -d "$EXTRACT_DIR/app-support" ]; then
    echo "→ Restoring ~/Library/Application Support/Cursor/"
    mkdir -p "$APP_SUPPORT"
    cp -R "$EXTRACT_DIR/app-support/"* "$APP_SUPPORT/" 2>/dev/null || true
    echo "  ✓ done"
fi

# 3. Restore ~/.cursor-agent/
if [ -d "$EXTRACT_DIR/dot-cursor-agent" ]; then
    echo "→ Restoring ~/.cursor-agent/"
    mkdir -p "$HOME/.cursor-agent"
    cp -R "$EXTRACT_DIR/dot-cursor-agent/"* "$HOME/.cursor-agent/" 2>/dev/null || true
    echo "  ✓ done"
fi

# 4. Show keychain info (manual step)
if [ -d "$EXTRACT_DIR/keychain" ]; then
    echo ""
    echo "🔑 Keychain entries found on source Mac:"
    for f in "$EXTRACT_DIR/keychain/"*.txt; do
        if [ -s "$f" ]; then
            echo "  → $(basename "$f")"
            cat "$f" | head -5
            echo ""
        fi
    done
    echo "⚠️  Keychain items can't be auto-imported."
    echo "   If auth still fails, you may need to manually sign in once."
fi

# 5. Show env vars
if [ -s "$EXTRACT_DIR/env/cursor-env.txt" ]; then
    echo ""
    echo "🌍 Environment variables on source Mac:"
    cat "$EXTRACT_DIR/env/cursor-env.txt"
    echo ""
    echo "Add these to your shell profile (~/.zshrc) if needed."
fi

# 6. Show binary info
if [ -d "$EXTRACT_DIR/binary-info" ]; then
    echo ""
    echo "📦 Source Mac binary info:"
    cat "$EXTRACT_DIR/binary-info/version.txt" 2>/dev/null || true
    cat "$EXTRACT_DIR/binary-info/node-info.txt" 2>/dev/null || true
fi

# Cleanup
rm -rf "$EXTRACT_DIR"

echo ""
echo "✅ Restore complete. Test with: cursor-agent --version"
