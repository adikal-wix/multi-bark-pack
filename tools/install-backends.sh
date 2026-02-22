#!/bin/bash
# install-backends.sh — Install all LLM backends for multi-bark-pack
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
skip() { echo -e "  ${YELLOW}⊘${NC} $1 (already installed)"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }

echo ""
echo "🐾 multi-bark-pack — Backend Installer"
echo "======================================="
echo ""

# ── Claude Code ──────────────────────────────────────────────
echo "1/4  Claude Code"
if command -v claude &>/dev/null; then
    skip "claude $(claude --version 2>/dev/null || echo '')"
else
    info "Installing via npm..."
    npm install -g @anthropic-ai/claude-code
    if command -v claude &>/dev/null; then
        ok "claude $(claude --version 2>/dev/null || echo '')"
    else
        fail "claude — install manually: npm install -g @anthropic-ai/claude-code"
    fi
fi

# ── Cursor Agent ─────────────────────────────────────────────
echo ""
echo "2/4  Cursor Agent"
if command -v agent &>/dev/null; then
    skip "agent $(agent --version 2>/dev/null || echo '')"
else
    if command -v brew &>/dev/null; then
        info "Installing via Homebrew..."
        brew install --cask cursor-cli
    else
        info "Homebrew not found, installing via curl..."
        curl -fsSL https://cursor.com/install | bash
    fi
    if command -v agent &>/dev/null; then
        ok "agent $(agent --version 2>/dev/null || echo '')"
    else
        fail "agent — install manually: brew install --cask cursor-cli"
        info "Requires a Cursor Pro subscription"
    fi
fi

# ── OpenAI Codex ─────────────────────────────────────────────
echo ""
echo "3/4  OpenAI Codex"
if command -v codex &>/dev/null; then
    skip "codex $(codex --version 2>/dev/null || echo '')"
else
    info "Installing via npm..."
    npm install -g @openai/codex
    if command -v codex &>/dev/null; then
        ok "codex $(codex --version 2>/dev/null || echo '')"
    else
        fail "codex — install manually: npm install -g @openai/codex"
    fi
fi

# ── Google Gemini ────────────────────────────────────────────
echo ""
echo "4/4  Google Gemini"
if command -v gemini &>/dev/null; then
    skip "gemini $(gemini --version 2>/dev/null || echo '')"
else
    info "Installing via npm..."
    npm install -g @google/gemini-cli
    if command -v gemini &>/dev/null; then
        ok "gemini $(gemini --version 2>/dev/null || echo '')"
    else
        fail "gemini — install manually: npm install -g @google/gemini-cli"
    fi
fi

# ── Summary ──────────────────────────────────────────────────
echo ""
echo "─── Summary ───"
echo ""
for cmd in claude agent codex gemini; do
    if command -v $cmd &>/dev/null; then
        ok "$cmd → $(which $cmd)"
    else
        fail "$cmd — not found"
    fi
done

echo ""
echo "Done. Run 'yarn start' to launch the server."
echo ""
