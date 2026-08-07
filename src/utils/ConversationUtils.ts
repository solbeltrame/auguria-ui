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
// outside `local`.
//
// Update first, insert only when there is no row yet. A plain upsert does not
// work: Postgres evaluates the INSERT policy's WITH CHECK even when ON CONFLICT
// takes the UPDATE path, and 05-12 only lets a member CREATE a membership row
// on a conversation that is visible WITHOUT it. So on a restricted conversation
// — a `local` direct, a Slack chat our bot is not in — the upsert is refused
// even though the member already owns the row it would have updated.
//
// Only `extra` is sent: the before-update merge trigger merges it key by key,
// and an explicit null retracts one.
export const updateConvExtra = async (
  conversation: ConversationRow,
  extra: ConversationAgentExtra,
) => {
  const { ownAgentId, setMembershipExtra } = useBoundStore.getState().chat;

  if (!ownAgentId) {
    throw new Error("No agent for the current user in this organization");
  }

  setMembershipExtra(conversation.id, extra);

  const { data: updated, error: updateError } = await supabase
    .from("conversations_agents")
    .update({ extra })
    .eq("conversation_id", conversation.id)
    .eq("agent_id", ownAgentId)
    .select("conversation_id");

  if (updateError) {
    throw updateError;
  }

  if (updated.length) return;

  // No row: the member is not a participant, which only happens on the
  // conversations they see through the account rule — the ones the INSERT
  // policy admits. Upserted rather than inserted so a second tab racing us to
  // the same first preference lands on the update path instead of a duplicate
  // key.
  const { error: insertError } = await supabase
    .from("conversations_agents")
    .upsert(
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

  if (insertError) {
    throw insertError;
  }
};

export async function saveDraft(
  conv: ConversationRow,
  text: string | null,
  sendAsContact?: boolean,
) {
  let origin = "human";

  if (sendAsContact !== undefined) {
    origin = sendAsContact ? "human-as-contact" : "human-as-organization";
  }

  await updateConvExtra(conv, {
    draft: text
      ? {
          text,
          timestamp: new Date().toISOString(),
          origin,
        }
      : null,
  });
}
