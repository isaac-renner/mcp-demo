# slack-codemode

A Slack MCP server for reading threads from URLs.

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the `SLACK_BOT_TOKEN` environment variable:

```bash
export SLACK_BOT_TOKEN=xoxb-your-token-here
```

### Required Slack Bot Scopes

- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `users:read`

## MCP Configuration

```json
{
  "mcpServers": {
    "slack": {
      "command": "node",
      "args": ["/path/to/slack-codemode/dist/index.js"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token-here"
      }
    }
  }
}
```

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

### `parse_slack_url`

Parse a Slack URL to extract IDs and timestamps. No API call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Slack URL to parse |

**Returns:**
```json
{
  "workspace": "myworkspace",
  "channelId": "C1234567890",
  "messageTs": "1234567890.123456",
  "threadTs": "1234567890.123456"
}
```

## Development

```bash
npm run dev    # Development mode
npm run build  # Build
npm start      # Run production build
```

## License

MIT
