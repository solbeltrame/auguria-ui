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
// outside `local`. Upserted so the row is created the first time a preference
// is set on a conversation the member is not a participant of.
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
