#!/usr/bin/env node

/**
 * Slack Codemode MCP Server
 *
 * An MCP server inspired by Cloudflare's codemode approach that provides
 * tools for reading Slack threads from URLs.
 *
 * The key insight from codemode: LLMs are better at writing code than
 * making tool calls. This server exposes simple, well-documented tools
 * that can be easily converted to a TypeScript API for code-based agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebClient, type ConversationsRepliesResponse } from "@slack/web-api";
import { z } from "zod";
import { parseSlackUrl, isSlackUrl, type SlackUrlInfo } from "./slack-url-parser.js";

// Get Slack token from environment
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) {
  console.error("Error: SLACK_BOT_TOKEN environment variable is required");
  console.error("Please set it to your Slack Bot token (xoxb-...)");
  process.exit(1);
}

// Initialize Slack client
const slack = new WebClient(SLACK_BOT_TOKEN);

// Tool input schemas
const ReadThreadSchema = z.object({
  url: z.string().describe("The Slack message or thread URL to read"),
  include_reactions: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include reaction information"),
  limit: z
    .number()
    .optional()
    .default(100)
    .describe("Maximum number of messages to return (default: 100)"),
});

const GetChannelInfoSchema = z.object({
  channel_id: z.string().describe("The Slack channel ID (e.g., C1234567890)"),
});

const SearchMessagesSchema = z.object({
  query: z.string().describe("Search query for messages"),
  channel_id: z
    .string()
    .optional()
    .describe("Optional: limit search to a specific channel"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results (default: 20)"),
});

// Helper to format a Slack message for output
interface SlackMessage {
  user?: string;
  text?: string;
  ts?: string;
  reactions?: Array<{ name?: string; count?: number }>;
  thread_ts?: string;
  reply_count?: number;
}

interface UserInfo {
  user?: {
    real_name?: string;
    name?: string;
  };
}

async function formatMessage(
  msg: SlackMessage,
  includeReactions: boolean,
  userCache: Map<string, string>
): Promise<string> {
  let userName = msg.user || "unknown";

  // Try to get user's display name
  if (msg.user && !userCache.has(msg.user)) {
    try {
      const userInfo = (await slack.users.info({ user: msg.user })) as UserInfo;
      const displayName =
        userInfo.user?.real_name || userInfo.user?.name || msg.user;
      userCache.set(msg.user, displayName);
    } catch {
      userCache.set(msg.user, msg.user);
    }
  }
  userName = userCache.get(msg.user!) || userName;

  const timestamp = msg.ts
    ? new Date(parseFloat(msg.ts) * 1000).toISOString()
    : "";

  let formatted = `**${userName}** (${timestamp}):\n${msg.text || "(no text)"}\n`;

  if (includeReactions && msg.reactions && msg.reactions.length > 0) {
    const reactionStr = msg.reactions
      .map((r) => `:${r.name}: (${r.count})`)
      .join(" ");
    formatted += `Reactions: ${reactionStr}\n`;
  }

  return formatted;
}

// Create the MCP server
const server = new Server(
  {
    name: "slack-codemode",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_slack_thread",
        description: `Read a full Slack thread given a Slack URL.

Supported URL formats:
- https://workspace.slack.com/archives/C1234567890/p1234567890123456
- https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=...

Returns the full conversation thread with sender names, timestamps, and message content.
This is the primary tool for understanding Slack conversations.`,
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The Slack message or thread URL to read",
            },
            include_reactions: {
              type: "boolean",
              description: "Whether to include reaction information",
              default: false,
            },
            limit: {
              type: "number",
              description: "Maximum number of messages to return",
              default: 100,
            },
          },
          required: ["url"],
        },
      },
      {
        name: "get_channel_info",
        description: `Get information about a Slack channel.

Returns channel name, topic, purpose, and member count.
Useful for understanding the context of a channel before reading messages.`,
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description: "The Slack channel ID (e.g., C1234567890)",
            },
          },
          required: ["channel_id"],
        },
      },
      {
        name: "parse_slack_url",
        description: `Parse a Slack URL to extract channel ID and message timestamps.

This is a utility tool that doesn't make any API calls - just parses the URL format.
Useful when you need to extract IDs from a Slack URL for other operations.`,
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The Slack URL to parse",
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_slack_thread": {
        const input = ReadThreadSchema.parse(args);

        if (!isSlackUrl(input.url)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: "${input.url}" does not appear to be a valid Slack URL`,
              },
            ],
            isError: true,
          };
        }

        const urlInfo = parseSlackUrl(input.url);
        if (!urlInfo) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Could not parse Slack URL. Supported formats:\n- https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP\n- https://workspace.slack.com/archives/CHANNEL_ID/pTIMESTAMP?thread_ts=...`,
              },
            ],
            isError: true,
          };
        }

        const userCache = new Map<string, string>();

        // If we have a thread timestamp, fetch the thread
        if (urlInfo.threadTs) {
          const response = (await slack.conversations.replies({
            channel: urlInfo.channelId,
            ts: urlInfo.threadTs,
            limit: input.limit,
          })) as ConversationsRepliesResponse;

          if (!response.ok || !response.messages) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error fetching thread: ${response.error || "Unknown error"}`,
                },
              ],
              isError: true,
            };
          }

          const formattedMessages = await Promise.all(
            response.messages.map((msg) =>
              formatMessage(msg as SlackMessage, input.include_reactions, userCache)
            )
          );

          const output = [
            `# Slack Thread (${response.messages.length} messages)`,
            `Channel: ${urlInfo.channelId}`,
            `Thread: ${urlInfo.threadTs}`,
            "",
            "---",
            "",
            ...formattedMessages,
          ].join("\n");

          return {
            content: [{ type: "text", text: output }],
          };
        }

        // No thread timestamp - fetch the single message
        const response = await slack.conversations.history({
          channel: urlInfo.channelId,
          latest: urlInfo.messageTs,
          inclusive: true,
          limit: 1,
        });

        if (!response.ok || !response.messages || response.messages.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Error fetching message: ${response.error || "Message not found"}`,
              },
            ],
            isError: true,
          };
        }

        const msg = response.messages[0] as SlackMessage;
        const formatted = await formatMessage(
          msg,
          input.include_reactions,
          userCache
        );

        // Check if this message has replies
        let output = `# Slack Message\nChannel: ${urlInfo.channelId}\n\n---\n\n${formatted}`;

        if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
          output += `\n(This message has ${msg.reply_count} replies. To read the full thread, the URL should include the thread_ts parameter.)`;
        }

        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "get_channel_info": {
        const input = GetChannelInfoSchema.parse(args);

        const response = await slack.conversations.info({
          channel: input.channel_id,
        });

        if (!response.ok || !response.channel) {
          return {
            content: [
              {
                type: "text",
                text: `Error fetching channel info: ${response.error || "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }

        const channel = response.channel as {
          name?: string;
          topic?: { value?: string };
          purpose?: { value?: string };
          num_members?: number;
          is_private?: boolean;
          is_archived?: boolean;
          created?: number;
        };

        const output = [
          `# Channel: #${channel.name || input.channel_id}`,
          "",
          `**ID:** ${input.channel_id}`,
          `**Private:** ${channel.is_private ? "Yes" : "No"}`,
          `**Archived:** ${channel.is_archived ? "Yes" : "No"}`,
          `**Members:** ${channel.num_members || "Unknown"}`,
          "",
          `**Topic:** ${channel.topic?.value || "(no topic)"}`,
          "",
          `**Purpose:** ${channel.purpose?.value || "(no purpose)"}`,
          "",
          channel.created
            ? `**Created:** ${new Date(channel.created * 1000).toISOString()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "parse_slack_url": {
        const { url } = z.object({ url: z.string() }).parse(args);

        if (!isSlackUrl(url)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: "${url}" does not appear to be a valid Slack URL`,
              },
            ],
            isError: true,
          };
        }

        const urlInfo = parseSlackUrl(url);
        if (!urlInfo) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Could not parse Slack URL format`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(urlInfo, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Slack Codemode MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
