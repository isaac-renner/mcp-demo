import { z } from "zod";
import { tool } from "opencontrol/tool";
import { create } from "opencontrol";
import { serve } from "@hono/node-server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { readSlackThread, getChannelInfo, parseSlackUrl, isSlackUrl } from "./slack.js";

const readThread = tool({
  name: "read_slack_thread",
  description: "Read a full Slack thread given a Slack URL. Returns the conversation with sender names, timestamps, and message content.",
  args: z.object({
    url: z.string().describe("The Slack message or thread URL"),
    include_reactions: z.boolean().optional().describe("Include reaction information"),
    limit: z.number().optional().describe("Maximum number of messages to return"),
  }),
  async run(input) {
    return readSlackThread(input);
  },
});

const channelInfo = tool({
  name: "get_channel_info",
  description: "Get information about a Slack channel including name, topic, purpose, and member count.",
  args: z.object({
    channel_id: z.string().describe("The Slack channel ID (e.g., C1234567890)"),
  }),
  async run(input) {
    return getChannelInfo(input.channel_id);
  },
});

const parseUrl = tool({
  name: "parse_slack_url",
  description: "Parse a Slack URL to extract channel ID and message timestamps. No API call made.",
  args: z.object({
    url: z.string().describe("The Slack URL to parse"),
  }),
  async run(input) {
    if (!isSlackUrl(input.url)) {
      throw new Error("Invalid Slack URL");
    }
    const urlInfo = parseSlackUrl(input.url);
    if (!urlInfo) {
      throw new Error("Could not parse URL");
    }
    return urlInfo;
  },
});

const app = create({
  model: createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })("claude-sonnet-4-20250514"),
  tools: [readThread, channelInfo, parseUrl],
});

const port = parseInt(process.env.PORT || "3000");

serve({ fetch: app.fetch, port }, () => {
  console.log(`OpenControl server running on http://localhost:${port}`);
});
