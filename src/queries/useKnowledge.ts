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
const STALE_PROCESSING_MS = 5 * 60 * 1_000;
const STALE_PROCESSING_MESSAGE =
  "O processamento foi interrompido antes de concluir. Tente processar novamente.";

const KNOWLEDGE_BASE_LIST_COLUMNS =
  "id,organization_id,name,description,status,created_by,created_at,updated_at";
const KNOWLEDGE_BASE_DETAIL_COLUMNS = `${KNOWLEDGE_BASE_LIST_COLUMNS},instructions,generated_context`;
const KNOWLEDGE_DOCUMENT_LIST_COLUMNS =
  "id,organization_id,knowledge_base_id,title,file_name,mime_type,file_size,status,error_message,source_type,source_url,active,created_by,created_at,updated_at";
const KNOWLEDGE_DOCUMENT_DETAIL_COLUMNS = `${KNOWLEDGE_DOCUMENT_LIST_COLUMNS},storage_path,extracted_text,metadata`;

function requireOrganization(id: string | null): string {
  if (!id) throw new Error("No active organization");
  return id;
}

function safeFileName(fileName: string): string {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return normalized || "arquivo";
}

async function recoverStaleProcessingDocuments(
  rows: KnowledgeDocumentRow[],
  organizationId: string,
): Promise<KnowledgeDocumentRow[]> {
  const cutoff = Date.now() - STALE_PROCESSING_MS;
  const staleIds = rows
    .filter(
      (row) =>
        row.status === "processing" &&
        new Date(row.updated_at).getTime() < cutoff,
    )
    .map((row) => row.id);
  if (!staleIds.length) return rows;

  try {
    const { data: recovered } = await supabase
      .from("knowledge_documents")
      .update({
        status: "error",
        error_message: STALE_PROCESSING_MESSAGE,
      })
      .eq("organization_id", organizationId)
      .eq("status", "processing")
      .in("id", staleIds)
      .select(KNOWLEDGE_DOCUMENT_LIST_COLUMNS)
      .throwOnError();
    if (!recovered?.length) return rows;
    const recoveredById = new Map(
      (recovered as KnowledgeDocumentRow[]).map((row) => [row.id, row]),
    );
    return rows.map((row) => recoveredById.get(row.id) || row);
  } catch {
    return rows;
  }
}

export function useKnowledgeBases(enabled = true) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.bases(organizationId),
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_bases")
        .select(KNOWLEDGE_BASE_LIST_COLUMNS)
        .eq("organization_id", organizationId!)
        .order("updated_at", { ascending: false })
        .throwOnError();
      return data as KnowledgeBaseRow[];
    },
    enabled: enabled && !!userId && !!organizationId,
  });
}

export function useKnowledgeBase(baseId?: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.base(organizationId, baseId),
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_bases")
        .select(KNOWLEDGE_BASE_DETAIL_COLUMNS)
        .eq("organization_id", organizationId!)
        .eq("id", baseId!)
        .single()
        .throwOnError();
      return data as KnowledgeBaseRow;
    },
    enabled: !!userId && !!organizationId && !!baseId,
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
        .select(KNOWLEDGE_DOCUMENT_LIST_COLUMNS)
        .eq("organization_id", organizationId!)
        .order("created_at", { ascending: false });
      if (baseId) query = query.eq("knowledge_base_id", baseId);
      const { data } = await query.throwOnError();
      return await recoverStaleProcessingDocuments(
        data as KnowledgeDocumentRow[],
        organizationId!,
      );
    },
    enabled: !!userId && !!organizationId && !!baseId,
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

export function useKnowledgeDocument(documentId?: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useQuery({
    queryKey: queryKeys.knowledge.document(organizationId, documentId),
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_documents")
        .select(KNOWLEDGE_DOCUMENT_DETAIL_COLUMNS)
        .eq("organization_id", organizationId!)
        .eq("id", documentId!)
        .single()
        .throwOnError();
      const [document] = await recoverStaleProcessingDocuments(
        [data as KnowledgeDocumentRow],
        organizationId!,
      );
      return document;
    },
    enabled: !!userId && !!organizationId && !!documentId,
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

export function useEnsureKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async () => {
      const organization_id = requireOrganization(organizationId);
      const base = await invokeFunction<KnowledgeBaseRow>(
        "knowledge-management/bases/default",
        {
          method: "POST",
          body: { organization_id },
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

export function useDuplicateKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      baseId,
      name,
      description,
    }: {
      baseId: string;
      name: string;
      description?: string;
    }) => {
      const organization_id = requireOrganization(organizationId);
      const base = await invokeFunction<KnowledgeBaseRow>(
        `knowledge-management/bases/${baseId}/duplicate`,
        {
          method: "POST",
          body: { organization_id, name, description },
        },
      );
      if (!base) throw new Error("Empty duplicated knowledge base response");
      return base;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
    },
  });
}

export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      baseId,
      instructions,
    }: {
      baseId: string;
      instructions: string;
    }) => {
      const organization_id = requireOrganization(organizationId);
      const base = await invokeFunction<KnowledgeBaseRow>(
        `knowledge-management/bases/${baseId}`,
        {
          method: "PATCH",
          body: { organization_id, instructions },
        },
      );
      if (!base) throw new Error("Empty knowledge base response");
      return base;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.base(organizationId, variables.baseId),
      });
    },
  });
}

export function useSynthesizeKnowledgeBase() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (baseId: string) => {
      const organization_id = requireOrganization(organizationId);
      const base = await invokeFunction<KnowledgeBaseRow>(
        `knowledge-management/bases/${baseId}/synthesize?organization_id=${encodeURIComponent(organization_id)}`,
        { method: "POST" },
      );
      if (!base) throw new Error("Empty knowledge base response");
      return base;
    },
    onSuccess: (_data, baseId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.base(organizationId, baseId),
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
    onSuccess: (_data, baseId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.bases(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.base(organizationId, baseId),
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
    mutationFn: async ({
      baseId,
      file,
      title,
    }: {
      baseId: string;
      file: File;
      title?: string;
    }) => {
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
            title: title?.trim() || undefined,
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

export function useCreateKnowledgeLink() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      baseId,
      url,
      title,
    }: {
      baseId: string;
      url: string;
      title?: string;
    }) => {
      const organization_id = requireOrganization(organizationId);
      const document = await invokeFunction<KnowledgeDocumentRow>(
        "knowledge-management/documents",
        {
          method: "POST",
          body: {
            organization_id,
            knowledge_base_id: baseId,
            source_type: "url",
            source_url: url,
            file_name: title?.trim() || undefined,
            title: title?.trim() || undefined,
            mime_type: "text/html",
            file_size: 0,
          },
        },
      );
      if (!document) throw new Error("Empty knowledge link response");
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

export function useUpdateKnowledgeDocument() {
  const queryClient = useQueryClient();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async ({
      document,
      active,
      title,
    }: {
      document: KnowledgeDocumentRow;
      active?: boolean;
      title?: string;
    }) => {
      const organization_id = requireOrganization(organizationId);
      const updated = await invokeFunction<KnowledgeDocumentRow>(
        `knowledge-management/documents/${document.id}?organization_id=${encodeURIComponent(organization_id)}`,
        {
          method: "PATCH",
          body: {
            ...(active !== undefined ? { active } : {}),
            ...(title !== undefined ? { title } : {}),
          },
        },
      );
      if (!updated) throw new Error("Empty knowledge document response");
      return updated;
    },
    onSettled: (_, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.documents(
          organizationId,
          variables.document.knowledge_base_id,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.document(
          organizationId,
          variables.document.id,
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
      void queryClient.removeQueries({
        queryKey: queryKeys.knowledge.document(organizationId, document.id),
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.knowledge.document(organizationId, document.id),
      });
    },
  });
}
