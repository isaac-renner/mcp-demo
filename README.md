# slack-codemode

A Slack MCP server inspired by [Cloudflare's codemode approach](https://blog.cloudflare.com/code-mode/) for reading Slack threads from URLs.

## What is this?

This MCP server provides tools to read Slack conversations by simply pasting a Slack URL. The key insight from Cloudflare's codemode: **LLMs are better at writing code than making tool calls**. This server exposes simple, well-documented tools that work great both as direct MCP tools and when converted to a TypeScript API for code-based agents.

## Features

- **Read full Slack threads** from a URL
- **Get channel information** for context
- **Parse Slack URLs** to extract channel IDs and timestamps
- Clean, formatted output with user names and timestamps

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

Your Slack Bot needs these OAuth scopes:
- `channels:history` - Read public channel messages
- `groups:history` - Read private channel messages  
- `im:history` - Read direct messages
- `mpim:history` - Read group DMs
- `users:read` - Get user display names

## Usage

### As an MCP Server

Add to your MCP client configuration (e.g., Claude Desktop):

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

### Tools

#### `read_slack_thread`

Read a full Slack thread from a URL.

**Input:**
```json
{
  "url": "https://myworkspace.slack.com/archives/C1234567890/p1234567890123456",
  "include_reactions": false,
  "limit": 100
}
```

**Supported URL formats:**
- `https://workspace.slack.com/archives/C1234567890/p1234567890123456`
- `https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=1234567890.123456`

#### `get_channel_info`

Get information about a Slack channel.

**Input:**
```json
{
  "channel_id": "C1234567890"
}
```

#### `parse_slack_url`

Parse a Slack URL to extract channel ID and timestamps (no API call).

**Input:**
```json
{
  "url": "https://myworkspace.slack.com/archives/C1234567890/p1234567890123456"
}
```

## Codemode Inspiration

This project takes inspiration from [Cloudflare's codemode](https://blog.cloudflare.com/code-mode/) and [jx-codes/codemode-mcp](https://github.com/jx-codes/codemode-mcp).

The core insight: LLMs have seen millions of real-world code examples but only synthetic tool-calling examples. By exposing well-documented APIs, agents can write code to orchestrate multiple calls efficiently, without round-tripping through the neural network for each step.

For example, in codemode style, an agent could write:

```typescript
// Read a thread and summarize it
const thread = await codemode.read_slack_thread({
  url: "https://company.slack.com/archives/C123/p1234567890123456"
});

const channelInfo = await codemode.get_channel_info({
  channel_id: "C123"
});

console.log(`Thread from #${channelInfo.name}:`);
console.log(thread);
```

## Development

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## License

MIT
