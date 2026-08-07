import useBoundStore from "@/stores/useBoundStore";
import {
  type ConversationAgentExtra,
  type ConversationInsert,
  type ConversationRow,
  supabase,
} from "@/supabase/client";

function pushConversationToStore(record: ConversationInsert) {
  // TODO: optimistic insert lacks some fields that the store considers as present - cabra 2024/07/28
  useBoundStore.getState().chat.pushConversations([record as ConversationRow]);
}

// Only `local` conversations may be inserted directly: on every other service
// the conversation row is minted by the first message's insert trigger, so
// this is a no-op there.
//
// ROUGH EDGE — a `local` direct is now identified by its ROSTER, not by the id
// we mint here. before_insert_on_conversations canonicalises the address to the
// sorted agent ids, and conversations_identity_idx is unique on
// (organization_id, organization_address, service, address), so the SECOND time
// the UI opens the same room this insert dies with a duplicate key. It bites
// both roster-addressed rooms we can open twice:
//
//   - the agent DM (routes/_auth/agents/$agentId.tsx), and
//   - "nueva conversación de prueba" (routes/_auth/conversations/new.tsx),
//     which states no address at all and so canonicalises to a roster of ONE —
//     your own agent id. There is exactly one of those per member, forever.
//
// The way out is already in the API: before_insert_on_messages resolves-or-
// creates on (organization_id, service, organization_address,
// conversation_address), so the client should state the canonical address and
// never mint a conversation id. That is a store change (conversations are keyed
// by id, and an optimistic row would have to adopt the id the insert answers
// with), so it is not done here.
export async function pushConversationToDb(record: ConversationInsert) {
  if (record.service !== "local") return;

  const insertQuery = await supabase.from("conversations").insert(record);

  if (insertQuery.error) {
    throw insertQuery.error;
  }
}

export function startConversation(conv: ConversationInsert) {
  const record: ConversationInsert = {
    ...conv,
    id: crypto.randomUUID(),
  };

  pushConversationToStore(record);

  return record.id;
}

// Per-member conversation state (archived/pinned/draft) lives on the caller's
// own conversations_agents row — members hold no UPDATE on conversations
// outside `local`. Upserted so the row is created the first time a preference
// is set on a conversation the member is not a participant of.
//
// ROUGH EDGE — this upsert is REFUSED on a restricted conversation, so drafts,
// archive and pin silently do nothing on a `local` direct (the agent DM, the
// test conversation) or a Slack chat our bot is not in.
//
// Postgres evaluates the INSERT policy's WITH CHECK even when ON CONFLICT takes
// the UPDATE path, and 05-12 only lets a member CREATE a membership row on a
// conversation that is visible WITHOUT it — a row there GRANTS visibility, so
// creating one at will would be a way into any private chat. A restricted
// conversation is visible only BY participating, so the with-check fails and
// the statement errors even though the member already owns the row it meant to
// update. Splitting it into UPDATE-then-INSERT sidesteps that, but this table
// is the wrong home for UI state either way: a dedicated table is coming, and
// it can carry its own policy instead of borrowing one written for
// participation.
export const updateConvExtra = async (
  conversation: ConversationRow,
  extra: ConversationAgentExtra,
) => {
  const { ownAgentId, setMembershipExtra } = useBoundStore.getState().chat;

  if (!ownAgentId) {
    throw new Error("No agent for the current user in this organization");
  }

  setMembershipExtra(conversation.id, extra);

  const { error } = await supabase.from("conversations_agents").upsert(
    {
      organization_id: conversation.organization_id,
      service: conversation.service,
      organization_address: conversation.organization_address,
      conversation_id: conversation.id,
      agent_id: ownAgentId,
      extra,
    },
    { onConflict: "conversation_id,agent_id" },
  );

  if (error) {
    throw error;
  }
};

export async function saveDraft(conv: ConversationRow, text: string | null) {
  await updateConvExtra(conv, {
    draft: text
      ? {
          text,
          timestamp: new Date().toISOString(),
          // "human" or "bot" — the two authors left. The old
          // human-as-contact/human-as-organization split went with
          // "send as contact".
          origin: "human",
        }
      : null,
  });
}
