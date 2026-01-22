# mcp-demo

A Slack MCP server for reading threads and posting messages.

## Installation

```bash
git clone https://github.com/isaac-renner/mcp-demo.git
cd mcp-demo
npm install
npm run build
```

## Configuration

### Required Slack Bot Scopes

- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `users:read`
- `chat:write`

## Usage

### OpenCode

Add to `~/.config/opencode/opencode.json` or `opencode.json` in your project:

```json
{
  "mcp": {
    "slack": {
      "type": "local",
      "command": ["node", "/path/to/mcp-demo/dist/index.js"],
      "enabled": true,
      "environment": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add slack -- node /path/to/mcp-demo/dist/index.js
```

Then set the environment variable in Claude Code's config (`~/.config/claude/config.json`):

```json
{
  "mcpServers": {
    "slack": {
      "command": "node",
      "args": ["/path/to/mcp-demo/dist/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here"
      }
    }
  }
}
```

Or export the token before running:

```bash
export SLACK_BOT_TOKEN=xoxb-your-token-here
claude
```

### OpenControl (Web UI)

Start the OpenControl server for a chat interface:

```bash
export SLACK_BOT_TOKEN=xoxb-your-token-here
export ANTHROPIC_API_KEY=sk-ant-your-key-here
npm run opencontrol
```

Open `http://localhost:3000` in your browser.

## Tools

### `read_slack_thread`

Read a full Slack thread from a URL.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | - | Slack message or thread URL |
| `include_reactions` | boolean | No | false | Include reactions |
| `limit` | number | No | 100 | Max messages to return |

**Supported URL formats:**
- `https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP`
- `https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP?thread_ts=...`

### `get_channel_info`

Get channel metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_id` | string | Yes | Slack channel ID (e.g., C1234567890) |

**Returns:** Channel name, topic, purpose, member count, privacy status.

### `post_message`

Post a message to a Slack channel. Links are automatically unfurled.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `channel_id` | string | Yes | Slack channel ID to post to |
| `text` | string | Yes | Message text (can include URLs) |
| `thread_ts` | string | No | Thread timestamp to reply in a thread |

### `parse_slack_url`

Parse a Slack URL to extract IDs and timestamps. No API call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Slack URL to parse |

## Development

```bash
npm run dev           # MCP server (dev)
npm run opencontrol   # OpenControl server
npm run build         # Build
npm start             # MCP server (production)
```

## License

MIT
