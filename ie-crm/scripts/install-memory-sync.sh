#!/bin/bash
# install-memory-sync.sh — Adds memory sync hooks to Claude Code settings
# Run this once on each machine where you use Claude Code with the CRM project

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-claude-memory.js"
NODE_PATH="$(which node)"

# Find the Claude Code settings file
SETTINGS_DIR="$HOME/.claude"
SETTINGS_FILE="$SETTINGS_DIR/settings.json"

if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "Error: sync-claude-memory.js not found at $SYNC_SCRIPT"
  exit 1
fi

if [ -z "$NODE_PATH" ]; then
  # Try common locations
  for p in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$p" ]; then
      NODE_PATH="$p"
      break
    fi
  done
fi

if [ -z "$NODE_PATH" ]; then
  echo "Error: node not found in PATH"
  exit 1
fi

echo "Using node at: $NODE_PATH"
echo "Sync script: $SYNC_SCRIPT"

# Create settings dir if needed
mkdir -p "$SETTINGS_DIR"

# Create or update settings.json with hooks
if [ -f "$SETTINGS_FILE" ]; then
  echo "Existing settings.json found. Adding hooks..."
  # Use node to safely merge the hooks into existing settings
  "$NODE_PATH" -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
    if (!settings.hooks) settings.hooks = {};

    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
    settings.hooks.Stop = settings.hooks.Stop || [];

    // Add pull on first tool use (session start proxy)
    const pullHook = {
      matcher: 'Read|Glob|Grep|Bash',
      command: '$NODE_PATH $SYNC_SCRIPT pull',
      runOnce: true
    };

    // Add push on stop (session end)
    const pushHook = {
      command: '$NODE_PATH $SYNC_SCRIPT push'
    };

    // Check if hooks already exist before adding
    const hasPull = settings.hooks.PreToolUse.some(h => h.command && h.command.includes('sync-claude-memory'));
    const hasPush = settings.hooks.Stop.some(h => h.command && h.command.includes('sync-claude-memory'));

    if (!hasPull) settings.hooks.PreToolUse.push(pullHook);
    if (!hasPush) settings.hooks.Stop.push(pushHook);

    fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2));
    console.log('Hooks added to settings.json');
  "
else
  echo "Creating new settings.json with hooks..."
  cat > "$SETTINGS_FILE" << SETTINGSEOF
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Glob|Grep|Bash",
        "command": "$NODE_PATH $SYNC_SCRIPT pull",
        "runOnce": true
      }
    ],
    "Stop": [
      {
        "command": "$NODE_PATH $SYNC_SCRIPT push"
      }
    ]
  }
}
SETTINGSEOF
  echo "Created settings.json with hooks"
fi

echo ""
echo "Memory sync installed! Here's what happens now:"
echo "  - On session start: pulls latest memory from Neon"
echo "  - On session end: pushes local memory to Neon"
echo ""
echo "To seed the database with this machine's memory, run:"
echo "  $NODE_PATH $SYNC_SCRIPT push"
