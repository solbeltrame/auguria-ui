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
    timestamp: string;
  } | null;
};

import { isInternal } from "./message_types";
import type { ConversationRow, MessageRow } from "./database_types";
import type { ConversationExtra } from "./extra_types";

export type Direction = "incoming" | "outgoing" | "internal";

type Addressed = Pick<
  MessageRow,
  "sender_address" | "content" | "agent_id" | "service"
>;

// `messages.direction` is gone: authorship is the addressing. But which side of
// the screen a bubble lands on is not authorship — it is authorship RELATIVE TO
// THE VIEWER, and those only coincide where the peer is a contact.
//
//   mine        agent_id is my own agent. Decided first, so a mirror service
//               filling sender_address on the echo of my own send (fill-once,
//               preserve_message_addressing) cannot flip my message to the
//               other side of the chat later.
//   local       peerless: there is no contact to be addressed by, sender_address
//               is always null and every party is a member. Anyone who is not me
//               IS the other side — which is what makes an AI DM read like a
//               chat instead of a monologue with two voices on the right.
//   elsewhere   the contact-space rule: sender_address set = the peer authored
//               it, null = the account did. A colleague's reply stays outgoing,
//               shared inbox and all; the avatar is what tells us apart.
export function messageDirection(
  message: Addressed,
  ownAgentId?: string | null,
): Direction {
  if (isInternal(message)) return "internal";

  if (ownAgentId && message.agent_id === ownAgentId) return "outgoing";

  if (message.service === "local") return "incoming";

  return message.sender_address !== null ? "incoming" : "outgoing";
}

export function isIncoming(
  message: Addressed,
  ownAgentId?: string | null,
): boolean {
  return messageDirection(message, ownAgentId) === "incoming";
}

export function isOutgoing(
  message: Addressed,
  ownAgentId?: string | null,
): boolean {
  return messageDirection(message, ownAgentId) === "outgoing";
}

// Can a message here have come from more than one party on the peer's side?
//
// That is what earns attribution — an avatar, or a sender name — its space: in
// a 1:1 the peer IS the conversation and repeating their name on every bubble
// says nothing. WhatsApp shows it in groups for exactly this reason, and the
// same reason covers the shapes it has no name for: a Slack mpim (`direct`,
// with `is_multiple` because an opaque channel id cannot show its own arity), a
// channel, and a `local` room whose roster holds more than the two of us.
export function isMultiParty(
  conversation: Pick<ConversationRow, "type" | "address" | "service" | "extra">,
): boolean {
  // group, channel, broadcast — anything that is not a two-person room. Null
  // means "not classified yet" (Slack can create the row before it knows), and
  // the honest answer there is the quiet one.
  if (conversation.type && conversation.type !== "direct") return true;

  if ((conversation.extra as ConversationExtra | null)?.is_multiple)
    return true;

  // A `local` direct's address IS its roster, so it carries its own arity.
  if (conversation.service === "local") {
    return conversation.address.split(":").length > 2;
  }

  return false;
}
