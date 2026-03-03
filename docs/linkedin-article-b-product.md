# I Control a Pack of AI Coding Agents From My Telegram Group Chat

*Audience: broad tech audience*

> Replace each `[SCREENSHOT: ...]` or `[VIDEO: ...]` placeholder with actual media before publishing.

---

Imagine texting "build me a REST API with auth" in a Telegram group — and watching an AI agent named Pikachu start coding it in real-time, streaming its progress right into the chat. That's **multi-bark-pack**.

> [VIDEO: 30-45s screen recording — typing a task in Telegram, agent spawning with themed name, live streaming progress, final response with code]

**What It Does**

It's an AI agent swarm manager. You send a message from Telegram, WhatsApp, or Slack, and it spawns an autonomous coding agent that works in a persistent session. Each agent gets a themed name (Paw Patrol characters, Mario Kart racers, Pokemon, or Israeli politicians), runs on any of 4 AI backends, and streams its work live into your chat.

> [SCREENSHOT: Telegram group with multiple active agents — each showing their themed emoji icon and name, working on different tasks]

**4 AI Brains, One Interface**

The system supports Claude Code, Cursor, OpenAI Codex, and Google Gemini — simultaneously. You choose by tagging: `#cursor fix the login bug` or `#gemini write tests for the API`. Each agent locks to its backend but you can have Mario running on Claude while Luigi works on Cursor, solving different parts of the same project.

And when one backend fails? The system automatically retries, resets with conversation context, or switches to another backend entirely — preserving the full conversation history across the transition.

> [SCREENSHOT: Telegram showing two agents side-by-side — one tagged [claude-code], another tagged [cursor] — both actively working]

**Talk to Your Agents Like a Team**

- `@Chase review the PR` — route a task to a specific agent
- Reply to any agent's message to continue the conversation
- Send a voice message and it gets transcribed locally (90+ languages, zero API cost)
- `/daily` — every agent sends a one-line standup update
- `/stats` — see exactly how much each agent has cost you

> [SCREENSHOT: Telegram showing `/stats` output — per-agent cost breakdown with backend and token counts]

Agents can even delegate to each other. A senior agent can spin up a sub-agent with `bark delegate "refactor this module" --branch`, which creates its own git branch and opens a PR when done. Fire-and-forget teamwork.

**Real-Time Everything**

Every agent streams its work live — you see tool calls happening (Read file... Edit function... Run tests...), thinking blocks, and final output, all as a continuously-edited message in your Telegram chat. A web dashboard gives you the full picture: agent statuses, cost tracking, activity timeline, and conversation history.

> [SCREENSHOT: Web admin dashboard — agent cards grid with status LEDs, the activity timeline on the right, pack icons visible on each card]

**The Command Center**

Telegram is the remote control, but the local web app is mission control. A real-time dashboard running on `localhost:3333` gives you full visibility and control over the swarm.

The **Pups panel** shows every active agent as a card — status LED (running / idle / error), backend, model, working directory, and live cost. Click any card to open the full conversation, send follow-up messages, or stop the agent. Shelved agents sit in a separate section, one tap away from resurrection.

> [SCREENSHOT: Admin dashboard Pups panel — grid of agent cards with status LEDs, backend labels, model tags, and per-agent cost]

The **Chat panel** is a built-in conversation view. Pick any agent and see its full message history — your prompts, the agent's responses, tool calls, errors. You can send messages directly from the browser without touching Telegram. Useful when you're at your desk and want the full-width view.

> [SCREENSHOT: Admin dashboard Chat panel — conversation thread with a selected agent, showing user messages and agent responses with tool call details]

The **Admin panel** is where you manage packs, configure backends, and customize your swarm. Browse all 4 theme packs with their per-character icons, switch the active pack, or create your own custom pack with any names and emojis you want.

> [SCREENSHOT: Admin panel pack editor — Pokemon pack selected, showing the icon + name chip grid with unique emojis per character]

The **Timeline** captures every event across the swarm — agent spawns, tool calls, delegations, errors, model switches — as a live feed. Filter by agent, backend, or event type. It's the audit log you didn't know you needed until you're debugging why Charizard opened 4 PRs in 10 minutes.

> [SCREENSHOT: Timeline panel — live event feed showing spawn, tool use, response, and delegation events with timestamps and agent names]

The **Stats panel** breaks down cost and usage across every agent and backend. Total spend, per-agent cost, token counts, turn counts — all in one view. Know exactly where your money goes.

> [SCREENSHOT: Stats panel — cost breakdown table showing per-agent and per-backend spending, token counts, and total cost]

Everything updates in real-time via WebSocket. Open the dashboard, open Telegram, and watch them stay perfectly in sync.

**1,056 Unique Agent Names**

Each "pack" has 32 themed names and 32 adjectives. When basic names run out, the system generates combinations: "brave-Charizard", "turbo-Bowser", "cosmic-Chase". That's 1,056 unique names per theme before any collision. Switch themes anytime — go from rescue pups to Pokemon to politicians mid-session.

**Built for the Phone-First Workflow**

The whole point is that you don't need to be at your computer. Commuting? Text an agent from Telegram. At your desk? Use the web dashboard. In a meeting? Voice-message a task and it gets transcribed locally (90+ languages, zero API cost). Having dinner? Check the status pin to see what your pack accomplished.

Security screening (optional, LLM-powered) filters incoming messages for prompt injection and destructive commands. Usage tracking tells you exactly what each agent costs. And everything persists across restarts — agents can be shelved and resurrected with their full conversation history intact.

**The Tech Stack**

Node.js, tmux for process management, whisper.cpp for voice, Express + WebSocket for the real-time dashboard. No database — just JSON files and atomic writes. It's simpler than it sounds, and that's the point.

**Open source:** github.com/itayshmool/multi-bark-pack
