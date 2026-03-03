# I Built an AI Agent Swarm That Runs 4 LLM Backends Simultaneously From a Telegram Group Chat

*Audience: engineering leaders & senior devs*

> Replace each `[SCREENSHOT: ...]` or `[VIDEO: ...]` placeholder with actual media before publishing.

---

What started as a weekend experiment turned into a production-grade orchestration layer for AI coding agents. Here's the architecture behind **multi-bark-pack** — a system that lets you manage a swarm of autonomous LLM agents from Telegram, WhatsApp, or Slack.

> [SCREENSHOT: Telegram group showing 3-4 agents working simultaneously — status pin at top, multiple agent responses with different backend tags like [claude-code], [cursor], [gemini]]

**The Problem**

Every AI coding CLI — Claude Code, Cursor, Codex, Gemini — speaks a different language. Different session formats, different streaming protocols, different output schemas. If you want agents working in parallel across backends, you're building a lot of glue code.

I wanted one interface, on my phone, that could spin up any backend, route conversations, handle failures, and track costs — all without touching a laptop.

**The Backend Abstraction**

The core insight is that every AI CLI ultimately does the same thing: take a prompt, stream output, maintain a session. So I built a unified interface.

Each backend implements `buildCommand()`, `generateSessionId()`, and `extractSessionId()` — plus a capabilities matrix that declares what it supports (streaming, sessions, system prompts). The server doesn't care which backend runs underneath. It builds the command, pipes it through tmux, and parses the stream.

Four backends. Four completely different JSON stream formats. One parser that normalizes them all into a live-edited Telegram message showing tool calls, thinking blocks, and final output.

> [SCREENSHOT: A single Telegram message being live-edited — showing streaming progress with tool chain display like "Read -> Edit -> Run tests -> Done"]

**Three-Tier Failure Recovery**

Agents fail. Context windows overflow. Rate limits hit. Backends go down. The fallback system handles all of it:

1. **Retry** — Exponential backoff for transient errors (rate limits, timeouts). Different multipliers per failure type.
2. **Reset** — New session on the same backend, but with conversation context injected. Rolling summaries + last 5 turns + modified file list. Token-aware: falls back to minimal context if the injection exceeds 4K tokens.
3. **Switch** — Moves to the next backend in priority order, carrying full context. Your Claude agent dies? It wakes up as a Cursor agent with the same conversation history.

The detector classifies failures via pattern matching against the output. The injector builds context from the history manager. The orchestrator sequences the strategies.

**Delegation Without Recursion**

Agents can spawn sub-agents: `bark delegate "refactor the auth module" --branch`. The sub-agent inherits the parent's context and working directory, creates its own git branch, works autonomously, and opens a PR when done.

The key constraint: sub-agents can't delegate further (max depth: 1, max 3 per parent). Delegation instructions are only injected into top-level agents. This prevents cascade failures and runaway agent trees.

> [SCREENSHOT: Telegram showing a parent agent (e.g. Mario) spawning a sub-agent (e.g. Luigi) — the status pin showing the sub-agent indented under parent with arrow]

**Cross-Platform Routing**

One message in Telegram spawns a tmux session running your chosen backend. Routing priority: reply-to > @name mention > new spawn. Voice messages go through local whisper.cpp transcription (zero API cost, 90+ languages). Files get delivered back through Telegram automatically.

> [VIDEO: 15-30s screen recording — sending a voice message in Telegram, seeing the transcription appear, then the agent responding with code changes]

**What I Learned**

Building this taught me that the hard part of AI orchestration isn't the LLM integration — it's the failure modes. The space between "agent started" and "agent delivered output" is where all the complexity lives: streaming format differences, session persistence across crashes, context preservation across backend switches, and cost tracking when every backend reports usage differently.

The entire system runs on file-based IPC (no database), atomic JSON writes, and tmux as the process manager. Sometimes the simplest architecture is the most resilient one.

> [SCREENSHOT: The web admin dashboard showing the full pack — agent cards with status LEDs, backend labels, cost tracking, and activity timeline]

**Open source:** github.com/itayshmool/multi-bark-pack
