//===================================
// UI-only types — NOT present in open-bsp-api's _shared/types/*.
//
// This file is never overwritten when re-syncing the mirrored API type files,
// so put genuinely UI-exclusive additions here (not divergences — those are
// field-level edits that must stay inline in the mirrored file, tagged with
// `// @ui-divergence`). See scripts/check-type-sync.sh.
//===================================

// The member's own per-conversation state, stored on their conversations_agents
// row (the API leaves that column untyped — "e.g. per-member state: muted,
// last_read_ts"). Written via upsert on the caller's own membership row; nulls
// retract keys through the merge_update trigger.
export type ConversationAgentExtra = {
  archived?: string | null;
  pinned?: string | null;
  draft?: {
    text: string;
    origin: string;
    timestamp: string;
  } | null;
};

import { isInternal } from "./message_types";
import type { MessageRow } from "./database_types";

export type Direction = "incoming" | "outgoing" | "internal";

// `messages.direction` is gone: authorship is the addressing. Incoming =
// sender_address set (the contact authored it), outgoing = null (us), and
// record-only rows carry the `content.internal` marker.
export function messageDirection(
  message: Pick<MessageRow, "sender_address" | "content">,
): Direction {
  if (isInternal(message)) return "internal";

  return message.sender_address !== null ? "incoming" : "outgoing";
}

export function isIncoming(
  message: Pick<MessageRow, "sender_address" | "content">,
): boolean {
  return messageDirection(message) === "incoming";
}

export function isOutgoing(
  message: Pick<MessageRow, "sender_address" | "content">,
): boolean {
  return messageDirection(message) === "outgoing";
}
