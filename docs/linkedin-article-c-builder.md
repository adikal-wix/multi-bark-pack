# I Gave My AI Agents Pokemon Names and Now They Run My Dev Workflow From Telegram

*Audience: personal narrative*

> Replace each `[SCREENSHOT: ...]` or `[VIDEO: ...]` placeholder with actual media before publishing.

---

A few months ago I was juggling Claude Code, Cursor, and Codex across different terminals, losing track of which agent was doing what. I thought: what if I could just text them, like a team chat?

So I built **multi-bark-pack** — and honestly, it changed how I think about AI-assisted development.

> [SCREENSHOT: Telegram group overview — the status pin at top showing all active agents with their themed names and status indicators]

**It Started Simple**

The first version was basic: a Telegram bot that piped messages into a Claude Code CLI session. One agent, one backend, one chat. But it worked — I could send a coding task from my phone and watch the agent work in real-time, streaming tool calls and output right into the Telegram thread.

Then I wanted two agents working simultaneously. Then I wanted Cursor as a fallback when Claude hit rate limits. Then I wanted voice messages. And delegation between agents. And before I knew it, I had a full agent swarm manager.

> [VIDEO: 20-30s screen recording — the Telegram chat in action, showing a message being sent and an agent responding with live streaming progress]

**The Pack Metaphor**

Every agent gets a name from a themed "pack." The default is Paw Patrol — so you get Chase handling your API refactor while Marshall fixes the frontend bug and Skye writes the tests. Switch to the Mario Kart pack and suddenly it's Bowser reviewing your PR while Yoshi deploys to staging.

It sounds silly, but the naming does something important: it makes agents feel like team members, not anonymous CLI sessions. When I text `@Pikachu how's the auth module going?` and get a status update, it feels like a real async standup. We even added a `/daily` command that requests a one-liner from every active agent.

> [SCREENSHOT: Telegram showing `/daily` command output — each agent reporting a one-line status update with their icon and name]

**The Multi-Backend Moment**

The real unlock was making backends interchangeable. Claude Code, Cursor, Codex, and Gemini all have different strengths. Claude is great at complex refactors. Cursor knows your codebase context. Codex is fast for small fixes. Gemini handles broad research well.

With multi-bark-pack, you pick the right tool: `#cursor fix the type error in auth.ts` or `#claude-code redesign the database schema`. And if a backend fails — context window overflow, rate limit, server error — the system automatically recovers. It'll retry with backoff, reset the session with a conversation summary injected, or switch to another backend entirely. Your work doesn't just disappear.

> [SCREENSHOT: Telegram showing backend selection in action — a message with `#gemini` tag spawning an agent on the Gemini backend]

**The Delegation Surprise**

The feature I didn't plan but now can't live without: agent delegation. A top-level agent can spawn a sub-agent with `bark delegate "write tests for the payment module" --branch`. The sub-agent creates its own branch, works independently, and opens a PR when done.

It's "delegate and forget" — the parent agent keeps working on its own task while the sub-agent handles the side quest. Max depth of 1 (sub-agents can't delegate further), max 3 sub-agents per parent. Just enough autonomy without chaos.

> [SCREENSHOT: Telegram showing a sub-agent appearing in the status pin, indented under its parent agent with the delegation arrow]

**What It Looks Like Day-to-Day**

Morning commute: I voice-message a task in Hebrew (whisper.cpp transcribes locally, no API cost). By the time I'm at my desk, Pikachu has a draft PR ready. I reply with feedback, Pikachu iterates. Meanwhile I text a separate task to Charizard on a different backend.

The web dashboard shows everything: live status, cost tracking ($49 total across 17 agents so far), activity timeline, conversation history. But honestly? I live in the Telegram chat. The status pin tells me who's working, who's stuck, and who's done.

> [SCREENSHOT: Web admin dashboard — full view showing agent grid, timeline, and cost summary]

**The Unsexy Parts That Matter**

The architecture is deliberately boring: Node.js, tmux for process management, JSON files for state (no database), atomic writes for crash safety. File-based IPC between the server and agent processes. WebSocket for real-time UI updates.

The hard problems weren't glamorous either: parsing 4 different JSON streaming formats into a unified display. Tracking sessions across backend switches. Debouncing state saves without losing data. Making sure agents can't nest Claude Code sessions (turns out the `CLAUDECODE` env var must be explicitly deleted from child processes or everything breaks).

**What I'd Tell Other Builders**

If you're building AI tooling, the LLM integration is 20% of the work. The other 80% is failure recovery, state management, and UX. Users don't care which model runs underneath — they care that their work survives a crash, that they can pick up where they left off, and that they can see what's happening without SSH-ing into a server.

The best architecture decision I made was keeping everything file-based and stateless. No Redis, no Postgres, no message queue. Just `.json` files, tmux sessions, and a Node.js event loop. It's deployable on any Mac with `yarn start`.

The second best decision was the themed naming. It sounds trivial, but it made the whole system feel alive. Pikachu isn't just agent-7f3a2b. Pikachu is the agent who's been refactoring your auth module for two hours and just opened a PR.

> [VIDEO: 45-60s final demo reel — fast cuts showing: Telegram message -> agent spawns -> live streaming -> delegation -> admin dashboard -> stats -> voice message transcription]

**Open source:** github.com/itayshmool/multi-bark-pack
