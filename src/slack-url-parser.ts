export interface SlackUrlInfo {
  workspace?: string;
  channelId: string;
  messageTs: string;
  threadTs?: string;
}

function parseSlackTimestamp(urlTs: string): string {
  const ts = urlTs.startsWith("p") ? urlTs.slice(1) : urlTs;

  if (ts.length === 16) {
    return `${ts.slice(0, 10)}.${ts.slice(10)}`;
  }

  if (ts.includes(".")) {
    return ts;
  }

  return ts;
}

export function parseSlackUrl(url: string): SlackUrlInfo | null {
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split(".");
    const workspace = hostParts[0] !== "app" ? hostParts[0] : undefined;
    const pathname = parsed.pathname;

    const archivesMatch = pathname.match(/^\/archives\/([A-Z0-9]+)\/p(\d+)$/i);
    if (archivesMatch) {
      const channelId = archivesMatch[1];
      const messageTs = parseSlackTimestamp(archivesMatch[2]);
      const threadTs = parsed.searchParams.get("thread_ts") ?? undefined;

      return {
        workspace,
        channelId,
        messageTs,
        threadTs: threadTs || messageTs,
      };
    }

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

export function isSlackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith(".slack.com") || parsed.hostname === "slack.com"
    );
  } catch {
    return false;
  }
}
