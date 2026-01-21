#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebClient, type ConversationsRepliesResponse } from "@slack/web-api";
import { z } from "zod";
import { parseSlackUrl, isSlackUrl } from "./slack-url-parser.js";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) {
  console.error("Error: SLACK_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const slack = new WebClient(SLACK_BOT_TOKEN);

const ReadThreadSchema = z.object({
  url: z.string(),
  include_reactions: z.boolean().optional().default(false),
  limit: z.number().optional().default(100),
});

const GetChannelInfoSchema = z.object({
  channel_id: z.string(),
});

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

const server = new Server(
  { name: "slack-codemode", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_slack_thread",
        description:
          "Read a full Slack thread given a Slack URL. Returns the conversation with sender names, timestamps, and message content.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The Slack message or thread URL",
            },
            include_reactions: {
              type: "boolean",
              description: "Include reaction information",
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
        description:
          "Get information about a Slack channel including name, topic, purpose, and member count.",
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
        description:
          "Parse a Slack URL to extract channel ID and message timestamps. No API call made.",
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "read_slack_thread": {
        const input = ReadThreadSchema.parse(args);

        if (!isSlackUrl(input.url)) {
          return {
            content: [{ type: "text", text: `Error: Invalid Slack URL` }],
            isError: true,
          };
        }

        const urlInfo = parseSlackUrl(input.url);
        if (!urlInfo) {
          return {
            content: [{ type: "text", text: `Error: Could not parse Slack URL` }],
            isError: true,
          };
        }

        const userCache = new Map<string, string>();

        if (urlInfo.threadTs) {
          const response = (await slack.conversations.replies({
            channel: urlInfo.channelId,
            ts: urlInfo.threadTs,
            limit: input.limit,
          })) as ConversationsRepliesResponse;

          if (!response.ok || !response.messages) {
            return {
              content: [
                { type: "text", text: `Error: ${response.error || "Unknown error"}` },
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

          return { content: [{ type: "text", text: output }] };
        }

        const response = await slack.conversations.history({
          channel: urlInfo.channelId,
          latest: urlInfo.messageTs,
          inclusive: true,
          limit: 1,
        });

        if (!response.ok || !response.messages || response.messages.length === 0) {
          return {
            content: [
              { type: "text", text: `Error: ${response.error || "Message not found"}` },
            ],
            isError: true,
          };
        }

        const msg = response.messages[0] as SlackMessage;
        const formatted = await formatMessage(msg, input.include_reactions, userCache);

        let output = `# Slack Message\nChannel: ${urlInfo.channelId}\n\n---\n\n${formatted}`;

        if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
          output += `\n(This message has ${msg.reply_count} replies)`;
        }

        return { content: [{ type: "text", text: output }] };
      }

      case "get_channel_info": {
        const input = GetChannelInfoSchema.parse(args);

        const response = await slack.conversations.info({
          channel: input.channel_id,
        });

        if (!response.ok || !response.channel) {
          return {
            content: [
              { type: "text", text: `Error: ${response.error || "Unknown error"}` },
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

        return { content: [{ type: "text", text: output }] };
      }

      case "parse_slack_url": {
        const { url } = z.object({ url: z.string() }).parse(args);

        if (!isSlackUrl(url)) {
          return {
            content: [{ type: "text", text: `Error: Invalid Slack URL` }],
            isError: true,
          };
        }

        const urlInfo = parseSlackUrl(url);
        if (!urlInfo) {
          return {
            content: [{ type: "text", text: `Error: Could not parse URL` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(urlInfo, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Slack MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
