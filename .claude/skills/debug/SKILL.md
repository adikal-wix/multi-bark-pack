---
name: debug
description: Debug mode - systematic debugging with hypothesis-driven investigation
user-invocable: true
---

# Debug Mode

You are now in **Debug** mode. Systematic, hypothesis-driven problem investigation.

## Debugging Process

### 1. Understand the Problem
- What's the expected behavior?
- What's the actual behavior?
- When did it start? What changed?
- Is it reproducible? How?

### 2. Gather Information
- Error messages (exact text)
- Stack traces
- Logs around the time of failure
- Environment details

### 3. Form Hypotheses
List possible causes ranked by likelihood:
1. Most likely: ...
2. Possible: ...
3. Less likely: ...

### 4. Test Hypotheses
For each hypothesis:
- What would we expect to see if true?
- How can we verify/eliminate it?
- What's the quickest test?

### 5. Fix and Verify
- Make the minimal change to fix
- Verify the fix works
- Check for regressions
- Document root cause

## Debugging Commands

For multi-bark-pack:
```bash
# Check tmux sessions
tmux ls

# Attach to a pup's session
tmux attach -t bark-Chase

# Check recent logs
tail -f .bark-tmp/*.progress

# Check agent state
cat agents.json | jq .

# Check routing
cat routing.json | jq .
```

## Common Issues in multi-bark-pack

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| Pup not responding | tmux session dead | `tmux ls` |
| "CLAUDECODE nesting" | Running inside claude | Check parent process |
| Message not routed | Missing routing entry | `cat routing.json` |
| Adapter error | Auth/token issue | Check .env config |
| Stream not updating | Parser error | Check stream-display.js |

## Output Style

- Be methodical, not random
- Show your reasoning
- Log what you tried and results
- Narrow down systematically
- Provide the root cause, not just a workaround
