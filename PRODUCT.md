# multi-bark-pack Product Spec

## Vision

**Turn any chat message into a persistent AI coding agent.**

Send a message in WhatsApp, Telegram, or Slack. Get a coding agent ("pup") that:
- Lives in a tmux session on your machine
- Remembers its full conversation history
- Can use multiple LLM backends (Claude, Cursor, Codex)
- Clones repos, writes code, runs tests, sends files back

No context windows to manage. No copy-pasting. Just chat and code.

---

## Value Proposition

| For | Pain Point | Solution |
|-----|------------|----------|
| Solo devs | Context switching between chat and IDE | Chat IS the interface |
| Remote workers | Need AI help on mobile/tablet | Works from any chat app |
| Power users | Different tasks need different models | Multi-backend support |
| Teams | Want shared AI agents | Group chat = shared pack |

**Why chat?**
- Already open all day
- Works on any device
- Natural async communication
- History is automatic

---

## User Personas

### 1. Solo Developer ("Alex")
- Works on personal projects
- Uses Telegram on phone and desktop
- Wants quick AI help without opening IDE
- **Needs:** Simple setup, reliable responses, mobile access

### 2. Power User ("Sam")
- Multiple projects, complex workflows
- Wants Claude for architecture, Haiku for quick tasks
- Monitors multiple pups working in parallel
- **Needs:** Multi-backend, model switching, status visibility

### 3. Team Lead ("Jordan")
- Small team sharing a pack
- Wants team members to spawn agents for tasks
- Needs visibility into who's doing what
- **Needs:** Multi-owner, clear attribution, cost tracking

---

## Implementation Phases

### Phase 0: Foundation (DONE)
Fork bark-pack with backend abstraction layer.

**Deliverables:**
- [x] `backends/` directory structure
- [x] `backends/claude-code.js` extracted
- [x] `stream-parsers/` directory structure
- [x] `stream-parsers/claude.js` extracted
- [x] Backend registry in `backends/index.js`
- [x] Agent model includes `backend` field
- [x] `/backends` command shows capabilities
- [x] Updated CLAUDE.md and README.md

**Status:** Complete

---

### Phase 1: Backend Parity
Ensure claude-code backend works identically to bark-pack.

**Deliverables:**
- [ ] All commands work (`/status`, `/stop`, `/clear`, `/reset`, `/reborn`, etc.)
- [ ] Live message editing works
- [ ] Session persistence works (resume conversations)
- [ ] Voice transcription works
- [ ] Model switching works (`#haiku`, `#sonnet`, `#opus`)
- [ ] File sending works (pup → user)
- [ ] End-to-end test on all 3 platforms

**Success criteria:** No regressions from bark-pack

**How to test:**
1. Start server, send message in Telegram → pup spawns, responds
2. Reply to pup → conversation continues
3. `/status`, `/stop`, `/clear`, `/reset`, `/reborn` all work
4. Send voice message → transcribed and handled
5. Use `#haiku` tag → model switches
6. Pup sends file → you receive it

**Automated tests:** `node test/run-all.js` — 44 tests covering:
- Backend module and initialization
- Stream parser
- Agent lifecycle commands
- Status building

**Status:** ✅ Complete (automated tests pass)

---

### Phase 2: Cursor Backend
Add Cursor CLI as second backend.

**Research needed:**
- [ ] Cursor CLI stream-json format — is it identical to Claude?
- [ ] Session management — how does `--resume` work?
- [ ] System prompts — supported in headless mode?
- [ ] Working directory — can we track cwd?

**Deliverables:**
- [ ] `backends/cursor.js` implemented
- [ ] `stream-parsers/cursor.js` implemented
- [ ] Backend selection at spawn time
- [ ] Documentation updated

**Success criteria:** Can spawn pups with Cursor, sessions persist, streaming works

**How to test:**
1. Install Cursor CLI (`curl https://cursor.com/install -fsS | bash`)
2. Add `cursor` to `ENABLED_BACKENDS` in `.env`
3. Start server → logs show "Backend Cursor v..."
4. Spawn pup with Cursor backend
5. Verify live streaming works
6. Send follow-up → conversation resumes

**Status:** Not started

---

### Phase 3: Backend Selection UX
Make it easy to choose and switch backends.

**Deliverables:**
- [ ] `/spawn cursor` — spawn pup with specific backend
- [ ] `#cursor` tag in messages — like `#haiku` for models
- [ ] Backend shown in status (e.g., `🟢 Chase [cursor]`)
- [ ] `/backends` shows which are installed vs available
- [ ] Default backend configurable in `.env`

**Success criteria:** Users can easily spawn and identify backend per pup

**How to test:**
1. Send `#cursor fix this bug` → pup spawns with Cursor backend
2. `/status` shows `🟢 Chase [cursor]`
3. `/backends` lists installed vs available
4. Change `DEFAULT_BACKEND` in `.env` → new pups use it

**Status:** Not started

---

### Phase 4: Capability Matrix
Surface backend differences clearly.

**Deliverables:**
- [ ] `/backends` shows feature matrix (streaming, sessions, etc.)
- [ ] Graceful degradation for missing capabilities
- [ ] Warnings when using unsupported features
- [ ] Per-backend model lists in help

**Success criteria:** Users understand what each backend can/can't do

**How to test:**
1. `/backends` shows matrix with checkmarks for each capability
2. Use a feature not supported by backend → get clear warning
3. `/help` shows available models per backend

**Status:** Not started

---

### Phase 5: Additional Backends
Expand backend support.

**Candidates:**
- [ ] OpenAI Codex / ChatGPT CLI (if available)
- [ ] Google Antigravity (if available)
- [ ] Aider (open source, has CLI)
- [ ] Continue (has API)

**Per backend:**
- [ ] Research CLI capabilities
- [ ] Implement backend module
- [ ] Implement stream parser
- [ ] Test and document

**How to test:** Same as Phase 2, per backend:
1. Install the backend CLI
2. Enable in `.env`
3. Spawn pup, verify streaming and sessions work

**Status:** Future

---

### Phase 6: Management UI
Web dashboard for pack visibility and control.

**Core Features (read-only):**
- [ ] Dashboard showing all pups with live status
- [ ] Pup detail view — conversation history, stats
- [ ] Backend status — installed, versions, capabilities
- [ ] Platform status — connected adapters, health
- [ ] Routing table viewer
- [ ] Cost/usage metrics (when available)

**Control Features (read-write):**
- [ ] Stop/clear/delete pups from UI
- [ ] Reset pup memory
- [ ] Edit configuration (.env values)
- [ ] Enable/disable backends
- [ ] Test platform connections

**Real-time Features:**
- [ ] WebSocket for live pup status updates
- [ ] Stream pup progress to browser
- [ ] Live log viewer
- [ ] Embedded terminal (xterm.js) to watch tmux sessions

**Technical Stack:**
- Express.js server (alongside existing server)
- WebSocket (ws or socket.io) for real-time
- Simple frontend (vanilla JS or lightweight framework)
- xterm.js for terminal embedding

**Deliverables:**
- [ ] `/ui` directory with frontend code
- [ ] REST API endpoints for data
- [ ] WebSocket server for live updates
- [ ] UI served at `http://localhost:3000` (configurable port)

**Success criteria:** Can monitor and manage pack without using chat

**How to test:** Open `http://localhost:3000`, see all pups, click to view details, use controls to stop/clear pups, watch live terminal output.

**Status:** Not started

---

### Phase 7: Cost & Usage Tracking
Track token usage and costs (where available).

**Deliverables:**
- [ ] Parse usage data from Claude output
- [ ] Track per-pup, per-session, per-day costs
- [ ] `/cost` command to show breakdown
- [ ] Cost in status message (optional)
- [ ] Budget alerts (optional)

**Success criteria:** Users can see how much they're spending

**How to test:** Run pups, use `/cost` command, verify numbers match Claude's reported usage.

**Status:** Out of scope (last priority)

---

## Current Status

**Phase:** 1 (Backend Parity) — Complete
**Next:** Phase 2 (Cursor Backend)

**Working:**
- Backend abstraction layer
- Claude Code backend
- All chat adapters (WA, TG, Slack)
- Core commands

**Not yet tested:**
- End-to-end flow with new architecture
- All edge cases

---

## Success Metrics

### Functional
- All bark-pack features work in multi-bark-pack
- Can spawn pups with multiple backends
- Sessions persist across restarts

### User Experience
- Backend selection is intuitive
- Status clearly shows backend per pup
- No confusion about capabilities

### Technical
- Adding a new backend requires only 2 files
- No backend-specific code in server.js
- Clean separation of concerns

---

## Non-Goals (for now)

- **Chat replacement UI** — chat apps remain the primary interface for talking to pups
- **Cloud hosting** — runs on your machine
- **User accounts / auth** — owner IDs in .env, UI is local-only
- **Billing integration** — just tracking, no payments
- **Mobile app** — use existing chat apps

---

## Open Questions

1. **Backend switching mid-conversation?**
   - Current answer: No, backend is locked per pup
   - Rationale: Session IDs are backend-specific

2. **Default backend per platform?**
   - e.g., Telegram defaults to Claude, Slack to Cursor
   - Current answer: Single global default
   - Could revisit if there's demand

3. **Backend aliases?**
   - e.g., `#claude` instead of `#claude-code`
   - Nice to have, not blocking

4. **Fallback backends?**
   - If Claude is overloaded, try Cursor?
   - Complex, probably not worth it

---

## Changelog

| Date | Change |
|------|--------|
| 2024-02-21 | Initial spec created |
| 2024-02-21 | Phase 0 complete — fork with backend abstraction |
