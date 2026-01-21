/**
 * Slack URL Parser
 *
 * Parses Slack URLs to extract channel ID, message timestamp, and thread timestamp.
 *
 * Supported URL formats:
 * - https://workspace.slack.com/archives/C1234567890/p1234567890123456
 * - https://workspace.slack.com/archives/C1234567890/p1234567890123456?thread_ts=1234567890.123456
 * - https://app.slack.com/client/T1234567890/C1234567890/thread/C1234567890-1234567890.123456
 */

export interface SlackUrlInfo {
  workspace?: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

/**
 * Convert Slack's URL timestamp format (p1234567890123456) to API format (1234567890.123456)
 */
function parseSlackTimestamp(urlTs: string): string {
  // Remove the 'p' prefix if present
  const ts = urlTs.startsWith("p") ? urlTs.slice(1) : urlTs;

  // Slack timestamps in URLs are in microseconds (16 digits)
  // API format is seconds.microseconds (e.g., 1234567890.123456)
  if (ts.length === 16) {
    return `${ts.slice(0, 10)}.${ts.slice(10)}`;
  }

  // If already in API format, return as-is
  if (ts.includes(".")) {
    return ts;
  }

  return ts;
}

/**
 * Parse a Slack URL to extract channel ID and message/thread timestamps
 */
export function parseSlackUrl(url: string): SlackUrlInfo | null {
  try {
    const parsed = new URL(url);

    // Extract workspace from hostname (e.g., "myworkspace" from "myworkspace.slack.com")
    const hostParts = parsed.hostname.split(".");
    const workspace =
      hostParts[0] !== "app" ? hostParts[0] : undefined;

    const pathname = parsed.pathname;

    // Format 1: /archives/CHANNEL_ID/pTIMESTAMP
    const archivesMatch = pathname.match(
      /^\/archives\/([A-Z0-9]+)\/p(\d+)$/i
    );
    if (archivesMatch) {
      const channelId = archivesMatch[1];
      const messageTs = parseSlackTimestamp(archivesMatch[2]);

      // Check for thread_ts in query params
      const threadTs = parsed.searchParams.get("thread_ts") ?? undefined;

      return {
        workspace,
        channelId,
        messageTs,
        threadTs: threadTs || messageTs, // If no thread_ts, the message itself is the thread parent
      };
    }

    // Format 2: /client/TEAM_ID/CHANNEL_ID/thread/CHANNEL_ID-TIMESTAMP
    const clientMatch = pathname.match(
      /^\/client\/[A-Z0-9]+\/([A-Z0-9]+)\/thread\/[A-Z0-9]+-(\d+\.\d+)$/i
    );
    if (clientMatch) {
      return {
        workspace,
        channelId: clientMatch[1],
        messageTs: clientMatch[2],
        threadTs: clientMatch[2],
      };
    }

    // Format 3: Just channel link /archives/CHANNEL_ID
    const channelMatch = pathname.match(/^\/archives\/([A-Z0-9]+)\/?$/i);
    if (channelMatch) {
      return {
        workspace,
        channelId: channelMatch[1],
        messageTs: "",
        threadTs: undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate that a string looks like a Slack URL
 */
export function isSlackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith(".slack.com") ||
      parsed.hostname === "slack.com"
    );
  } catch {
    return false;
  }
}
