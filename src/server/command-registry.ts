/**
 * Command registry — help text builders for /help command.
 */

const COMMANDS: Array<[string, string]> = [
  ['/help', 'Show quick command reference'],
  ['/help full', 'Show full command list'],
  ['/status', 'Refresh pinned status message'],
  ['/backends', 'Show available LLM backends'],
  ['/skills', 'List available skills'],
  ['/skill <name> @<pup>', 'Add a skill to a pup'],
  ['/stop <name|pack>', 'Stop a running pup (or all)'],
  ['/clear <name|pack>', 'Shelve a pup (can /reborn later)'],
  ['/delete <name|pack>', 'Permanently remove a pup'],
  ['/reset <name|pack>', 'Wipe pup memory (stays active)'],
  ['/daily', 'Request standup from every pup'],
  ['/stats [name]', 'Show usage & cost summary'],
  ['/create', 'Reply to a message to spawn with context'],
  ['/losts', 'List shelved pups'],
  ['/reborn <name>', 'Resurrect a shelved pup'],
  ['/purge', 'Delete all shelved pups'],
  ['/approve <name|pack>', 'Approve pending operation'],
  ['/deny <name|pack>', 'Deny pending operation'],
  ['/reload-policy', 'Hot-reload bark-policy.json'],
  ['/restart', 'Restart the server'],
  ['/shutdown', 'Shut down the server'],
];

const QUICK_COMMANDS: Array<[string, string]> = [
  ['/stop', 'stop pup'],
  ['/clear', 'shelve pup'],
  ['/reset', 'wipe memory'],
  ['/status', 'refresh status'],
  ['/help full', 'all commands'],
];

export function buildFullHelp(): string {
  const lines = ['*Commands:*', ''];
  for (const [cmd, desc] of COMMANDS) {
    lines.push(`\`${cmd}\` — ${desc}`);
  }
  return lines.join('\n');
}

export function buildQuickView(lastAgentName: string | null): string {
  const lines: string[] = [];
  if (lastAgentName) {
    lines.push(`Last active pup: *${lastAgentName}*`);
    lines.push('Reply or send a new message to continue.\n');
  }
  lines.push('*Quick commands:*');
  for (const [cmd, desc] of QUICK_COMMANDS) {
    lines.push(`\`${cmd}\` — ${desc}`);
  }
  return lines.join('\n');
}
