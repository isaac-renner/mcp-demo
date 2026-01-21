#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readSlackThread, getChannelInfo, postMessage, parseSlackUrl, isSlackUrl } from "./slack.js";

const ReadThreadSchema = z.object({
  url: z.string(),
  include_reactions: z.boolean().optional().default(false),
  limit: z.number().optional().default(100),
});

const GetChannelInfoSchema = z.object({
  channel_id: z.string(),
});

const PostMessageSchema = z.object({
  channel_id: z.string(),
  text: z.string(),
  thread_ts: z.string().optional(),
});

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
      {
        name: "post_message",
        description:
          "Post a message to a Slack channel. Can include links which will be unfurled.",
        inputSchema: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description: "The Slack channel ID to post to (e.g., C1234567890)",
            },
            text: {
              type: "string",
              description: "The message text to post (can include URLs)",
            },
            thread_ts: {
              type: "string",
              description: "Optional thread timestamp to reply in a thread",
            },
          },
          required: ["channel_id", "text"],
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
        const result = await readSlackThread(input);
        return { content: [{ type: "text", text: result }] };
      }

      case "get_channel_info": {
        const input = GetChannelInfoSchema.parse(args);
        const result = await getChannelInfo(input.channel_id);
        return { content: [{ type: "text", text: result }] };
      }

      case "parse_slack_url": {
        const { url } = z.object({ url: z.string() }).parse(args);

        if (!isSlackUrl(url)) {
          return {
            content: [{ type: "text", text: "Error: Invalid Slack URL" }],
            isError: true,
          };
        }

        const urlInfo = parseSlackUrl(url);
        if (!urlInfo) {
          return {
            content: [{ type: "text", text: "Error: Could not parse URL" }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(urlInfo, null, 2) }],
        };
      }

      case "post_message": {
        const input = PostMessageSchema.parse(args);
        const result = await postMessage(input);
        return { content: [{ type: "text", text: result }] };
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
