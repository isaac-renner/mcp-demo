import { WebClient } from "@slack/web-api";
import { parseSlackUrl, isSlackUrl } from "./slack-url-parser.js";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!SLACK_BOT_TOKEN) {
  console.error("Error: SLACK_BOT_TOKEN environment variable is required");
  process.exit(1);
}

export const slack = new WebClient(SLACK_BOT_TOKEN);

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

export async function readSlackThread(input: {
  url: string;
  include_reactions?: boolean;
  limit?: number;
}): Promise<string> {
  const includeReactions = input.include_reactions ?? false;
  const limit = input.limit ?? 100;

  if (!isSlackUrl(input.url)) {
    throw new Error("Invalid Slack URL");
  }

  const urlInfo = parseSlackUrl(input.url);
  if (!urlInfo) {
    throw new Error("Could not parse Slack URL");
  }

  const userCache = new Map<string, string>();

  if (urlInfo.threadTs) {
    const response = await slack.conversations.replies({
      channel: urlInfo.channelId,
      ts: urlInfo.threadTs,
      limit,
    });

    if (!response.ok || !response.messages) {
      throw new Error(response.error || "Unknown error");
    }

    const formattedMessages = await Promise.all(
      response.messages.map((msg) =>
        formatMessage(msg as SlackMessage, includeReactions, userCache)
      )
    );

    return [
      `# Slack Thread (${response.messages.length} messages)`,
      `Channel: ${urlInfo.channelId}`,
      `Thread: ${urlInfo.threadTs}`,
      "",
      "---",
      "",
      ...formattedMessages,
    ].join("\n");
  }

  const response = await slack.conversations.history({
    channel: urlInfo.channelId,
    latest: urlInfo.messageTs,
    inclusive: true,
    limit: 1,
  });

  if (!response.ok || !response.messages || response.messages.length === 0) {
    throw new Error(response.error || "Message not found");
  }

  const msg = response.messages[0] as SlackMessage;
  const formatted = await formatMessage(msg, includeReactions, userCache);

  let output = `# Slack Message\nChannel: ${urlInfo.channelId}\n\n---\n\n${formatted}`;

  if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
    output += `\n(This message has ${msg.reply_count} replies)`;
  }

  return output;
}

export async function getChannelInfo(channelId: string): Promise<string> {
  const response = await slack.conversations.info({ channel: channelId });

  if (!response.ok || !response.channel) {
    throw new Error(response.error || "Unknown error");
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

  return [
    `# Channel: #${channel.name || channelId}`,
    "",
    `**ID:** ${channelId}`,
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
}

export { parseSlackUrl, isSlackUrl };
