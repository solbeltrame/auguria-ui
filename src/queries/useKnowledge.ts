import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invokeFunction,
  type KnowledgeBaseRow,
  type KnowledgeDocumentRow,
  supabase,
} from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

const MAX_FILE_SIZE = 20 * 1000 * 1000;

function requireOrganization(id: string | null): string {
  if (!id) throw new Error("No active organization");
  return id;
}

function safeFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return normalized.replace(/^-+|-+$/g, "").slice(0, 180) || "arquivo";
}

export function useKnowledgeBases() {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.bases(organizationId),
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_bases")
        .select()
        .eq("organization_id", organizationId!)
        .order("updated_at", { ascending: false })
        .throwOnError();
      return data as KnowledgeBaseRow[];
    },
    enabled: !!userId && !!organizationId,
  });
}

export function useKnowledgeDocuments(baseId?: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.documents(organizationId, baseId),
    queryFn: async () => {
      let query = supabase
        .from("knowledge_documents")
        .select()
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (baseId) query = query.eq("knowledge_base_id", baseId);
      const { data } = await query.throwOnError();
      return data as KnowledgeDocumentRow[];
    },
    enabled: !!userId && !!organizationId,
    refetchInterval: (query) => {
      const rows = query.state.data as KnowledgeDocumentRow[] | undefined;
      return rows?.some(
        (row) => row.status === "pending" || row.status === "processing",
      )
        ? 5000
        : false;
    },
  });
}

export function useAgentKnowledgeBaseIds(agentId?: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.agentLinks(organizationId, agentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("agent_knowledge_bases")
        .select("knowledge_base_id")
        .eq("organization_id", organizationId!)
        .eq("agent_id", agentId!)
        .throwOnError();
      return data.map((row) => row.knowledge_base_id);
    },
    enabled: !!userId && !!organizationId && !!agentId,
  });
}

export function useUpdateAgentKnowledgeBases(agentId: string) {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (baseIds: string[]) => {
      const organization_id = requireOrganization(organizationId);
      const { data: current } = await supabase
        .from("agent_knowledge_bases")
        .select("knowledge_base_id")
        .eq("organization_id", organization_id)
        .eq("agent_id", agentId)
        .throwOnError();
      const currentIds = new Set(current.map((row) => row.knowledge_base_id));
      const nextIds = [...new Set(baseIds)];

      await Promise.all(
        current
          .filter((row) => !nextIds.includes(row.knowledge_base_id))
          .map((row) =>
            supabase
              .from("agent_knowledge_bases")
              .delete()
              .eq("organization_id", organization_id)
              .eq("agent_id", agentId)
              .eq("knowledge_base_id", row.knowledge_base_id)
              .throwOnError(),
          ),
      );

      const inserts = nextIds
        .filter((baseId) => !currentIds.has(baseId))
        .map((knowledge_base_id) => ({
          organization_id,
          agent_id: agentId,
          knowledge_base_id,
        }));
      if (inserts.length) {
        await supabase
          .from("agent_knowledge_bases")
          .insert(inserts)
          .throwOnError();
      }
      return nextIds;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.agentLinks(organizationId, agentId),
      });
    },
  });
}

export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const organization_id = requireOrganization(organizationId);
      const base = await invokeFunction<KnowledgeBaseRow>(
        "knowledge-management/bases",
        {
          method: "POST",
          body: { organization_id, ...payload },
        },
      );
      if (!base) throw new Error("Empty knowledge base response");
      return base;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
    },
  });
}

export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (baseId: string) => {
      const organization_id = requireOrganization(organizationId);
      await invokeFunction<unknown>(
        `knowledge-management/bases/${baseId}?organization_id=${encodeURIComponent(organization_id)}`,
        { method: "DELETE" },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: [organizationId, "knowledge_documents"],
      });
    },
  });
}

export function useUploadKnowledgeDocument() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({ baseId, file }: { baseId: string; file: File }) => {
      const organization_id = requireOrganization(organizationId);
      if (!file.size || file.size > MAX_FILE_SIZE) {
        throw new Error("Cada arquivo deve ter entre 1 B e 20 MB");
      }

      const storagePath = [
        organization_id,
        baseId,
        `${crypto.randomUUID()}-${safeFileName(file.name)}`,
      ].join("/");
      const { error: uploadError } = await supabase.storage
        .from("knowledge")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw uploadError;

      const document = await invokeFunction<KnowledgeDocumentRow>(
        "knowledge-management/documents",
        {
          method: "POST",
          body: {
            organization_id,
            knowledge_base_id: baseId,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
          },
        },
      );
      if (!document) throw new Error("Empty knowledge document response");
      return document;
    },
    onSettled: (_, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.documents(
          organizationId,
          variables.baseId,
        ),
      });
    },
  });
}

export function useDeleteKnowledgeDocument() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (document: KnowledgeDocumentRow) => {
      const organization_id = requireOrganization(organizationId);
      await invokeFunction<unknown>(
        `knowledge-management/documents/${document.id}?organization_id=${encodeURIComponent(organization_id)}`,
        { method: "DELETE" },
      );
      return document;
    },
    onSuccess: (document) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.documents(
          organizationId,
          document.knowledge_base_id,
        ),
      });
    },
  });
}

export function useReprocessKnowledgeDocument() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (document: KnowledgeDocumentRow) => {
      const organization_id = requireOrganization(organizationId);
      const processed = await invokeFunction<KnowledgeDocumentRow>(
        `knowledge-management/documents/${document.id}/reprocess?organization_id=${encodeURIComponent(organization_id)}`,
        { method: "POST" },
      );
      if (!processed) throw new Error("Empty knowledge document response");
      return processed;
    },
    onSettled: (_, _error, document) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.documents(
          organizationId,
          document.knowledge_base_id,
        ),
      });
    },
  });
}
