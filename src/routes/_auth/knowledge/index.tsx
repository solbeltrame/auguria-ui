import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenText,
  CheckCircle2,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import Button from "@/components/Button";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgent } from "@/queries/useAgents";
import {
  useCreateKnowledgeBase,
  useDeleteKnowledgeBase,
  useDeleteKnowledgeDocument,
  useKnowledgeBases,
  useKnowledgeDocuments,
  useUploadKnowledgeDocument,
} from "@/queries/useKnowledge";
import useBoundStore from "@/stores/useBoundStore";
import type { KnowledgeDocumentRow } from "@/supabase/client";

export const Route = createFileRoute("/_auth/knowledge/")({
  component: KnowledgePage,
});

const ACCEPTED_FILES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.html,.rtf,.sql,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function statusLabel(
  document: KnowledgeDocumentRow,
  translate: (value: string) => string,
) {
  switch (document.status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 text-primary">
          <CheckCircle2 className="h-4 w-4" />
          {translate("Pronto")}
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          {translate("Processando")}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-destructive">
          <XCircle className="h-4 w-4" />
          {translate("Erro")}
        </span>
      );
    default:
      return (
        <span className="text-muted-foreground">{translate("Na fila")}</span>
      );
  }
}

function KnowledgePage() {
  const { translate: t } = useTranslation();
  const organizationId = useBoundStore((state) => state.ui.activeOrgId);
  const { data: currentAgent } = useCurrentAgent();
  const { data: bases, isLoading: basesLoading } = useKnowledgeBases();
  const createBase = useCreateKnowledgeBase();
  const deleteBase = useDeleteKnowledgeBase();
  const uploadDocument = useUploadKnowledgeDocument();
  const deleteDocument = useDeleteKnowledgeDocument();
  const [selectedBaseId, setSelectedBaseId] = useState<string>();
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const selectedBase = bases?.find((base) => base.id === selectedBaseId);
  const { data: documents, isLoading: documentsLoading } =
    useKnowledgeDocuments(selectedBaseId);

  useEffect(() => {
    if (!bases?.length) {
      setSelectedBaseId(undefined);
      return;
    }

    if (!selectedBaseId || !bases.some((base) => base.id === selectedBaseId)) {
      setSelectedBaseId(bases[0].id);
    }
  }, [bases, selectedBaseId]);

  const handleCreateBase = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name) return;

    createBase.mutate(
      { name, description: baseDescription.trim() || undefined },
      {
        onSuccess: (base) => {
          setBaseName("");
          setBaseDescription("");
          setSelectedBaseId(base.id);
        },
      },
    );
  };

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(Array.from(event.target.files || []));
    setUploadError(undefined);
  };

  const handleUpload = async () => {
    if (!selectedBaseId || !selectedFiles.length) return;

    setUploadError(undefined);
    const failures: string[] = [];
    for (const file of selectedFiles) {
      try {
        await uploadDocument.mutateAsync({ baseId: selectedBaseId, file });
      } catch (error) {
        failures.push(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setSelectedFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    if (failures.length) setUploadError(failures.join("\n"));
  };

  const handleDeleteBase = () => {
    if (!selectedBase || !organizationId || !isAdmin) return;
    if (!window.confirm(`${t("Excluir a base")} “${selectedBase.name}”?`))
      return;
    deleteBase.mutate(selectedBase.id);
  };

  const handleDeleteDocument = (document: KnowledgeDocumentRow) => {
    if (!isAdmin) return;
    if (!window.confirm(`${t("Excluir o arquivo")} “${document.file_name}”?`))
      return;
    deleteDocument.mutate(document);
  };

  return (
    <>
      <SectionHeader title={t("Base de conhecimento")} />

      <SectionBody className="gap-6">
        <section
          className="flex flex-col gap-3 px-[10px]"
          aria-labelledby="knowledge-intro"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <BookOpenText className="h-6 w-6" />
            </div>
            <div>
              <h2
                id="knowledge-intro"
                className="text-[16px] font-medium text-foreground"
              >
                {t("Ensine o Auguria sobre o seu negócio")}
              </h2>
              <p className="mt-1">
                {t(
                  "Envie documentos e o agente vai buscar os trechos relevantes antes de responder.",
                )}
              </p>
            </div>
          </div>
          <p className="text-[13px]">
            {t(
              "PDF, Word, PowerPoint, Excel, textos, imagens e áudios são aceitos. Arquivos de imagem, áudio e PDF escaneado usam a configuração Google/Gemini de pré-processamento.",
            )}
          </p>
        </section>

        <section
          className="flex flex-col gap-3"
          aria-labelledby="knowledge-bases"
        >
          <div className="flex items-center justify-between px-[10px]">
            <h2
              id="knowledge-bases"
              className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t("Bases")}
            </h2>
            {basesLoading && (
              <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {bases?.map((base) => (
            <div
              key={base.id}
              className={`flex items-center rounded-xl hover:bg-accent ${selectedBaseId === base.id ? "bg-primary/10" : ""}`}
            >
              <button
                type="button"
                onClick={() => setSelectedBaseId(base.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-[10px] py-[10px] text-left"
              >
                <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-foreground">
                    {base.name}
                  </span>
                  {base.description && (
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {base.description}
                    </span>
                  )}
                </span>
              </button>
              {isAdmin && selectedBaseId === base.id && (
                <button
                  type="button"
                  title={t("Excluir base")}
                  className="mr-2 rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDeleteBase}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {isAdmin && (
            <form
              className="rounded-xl bg-muted/50 p-[14px]"
              onSubmit={handleCreateBase}
            >
              <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-foreground">
                <Plus className="h-4 w-4 text-primary" />
                {t("Criar nova base")}
              </div>
              <label>
                <div className="label">{t("Nome")}</div>
                <input
                  className="text"
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder={t("Ex.: Manual comercial")}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                <div className="label">{t("Descrição (opcional)")}</div>
                <textarea
                  className="text min-h-[42px]"
                  value={baseDescription}
                  onChange={(event) => setBaseDescription(event.target.value)}
                  placeholder={t("Para que esta base serve?")}
                  maxLength={500}
                />
              </label>
              <Button
                type="submit"
                className="primary mt-3"
                loading={createBase.isPending}
                invalid={!baseName.trim()}
              >
                {t("Criar base")}
              </Button>
            </form>
          )}

          {!basesLoading && !bases?.length && (
            <div className="px-[10px] text-[14px] text-muted-foreground">
              {isAdmin
                ? t("Crie a primeira base para começar.")
                : t("Ainda não há bases cadastradas.")}
            </div>
          )}
        </section>

        {selectedBase && (
          <section
            className="flex flex-col gap-3"
            aria-labelledby="knowledge-files"
          >
            <div className="flex items-center justify-between px-[10px]">
              <div>
                <h2
                  id="knowledge-files"
                  className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {t("Arquivos")}
                </h2>
                <p className="mt-1 text-[13px]">{selectedBase.name}</p>
              </div>
              {documentsLoading && (
                <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {isAdmin && (
              <div className="rounded-xl border border-border p-[14px]">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-primary/40 px-4 py-5 text-center hover:bg-primary/5">
                  <Upload className="h-6 w-6 text-primary" />
                  <span className="text-[14px] font-medium text-foreground">
                    {t("Selecionar arquivos")}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {t("Até 20 MB por arquivo")}
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    onChange={handleFiles}
                  />
                </label>
                {!!selectedFiles.length && (
                  <div className="mt-3 flex flex-col gap-1">
                    {selectedFiles.map((file) => (
                      <div
                        key={`${file.name}-${file.lastModified}`}
                        className="flex items-center gap-2 text-[13px] text-foreground"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {file.name}
                        </span>
                        <span className="text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                    <Button
                      type="button"
                      className="primary mt-2"
                      loading={uploadDocument.isPending}
                      onClick={() => void handleUpload()}
                    >
                      {t("Enviar e indexar")}
                    </Button>
                  </div>
                )}
                {uploadError && (
                  <p className="mt-3 whitespace-pre-line text-[13px] text-destructive">
                    {uploadError}
                  </p>
                )}
              </div>
            )}

            {documents?.map((document) => (
              <div
                key={document.id}
                className="flex items-start gap-3 rounded-xl px-[10px] py-[8px] hover:bg-accent"
              >
                <FileText className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[14px] text-foreground"
                    title={document.file_name}
                  >
                    {document.file_name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="text-muted-foreground">
                      {formatBytes(document.file_size)}
                    </span>
                    {statusLabel(document, t)}
                  </div>
                  {document.error_message && (
                    <div className="mt-1 text-[12px] text-destructive">
                      {document.error_message}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t("Excluir arquivo")}
                    onClick={() => handleDeleteDocument(document)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            {!documentsLoading && !documents?.length && (
              <div className="px-[10px] text-[14px] text-muted-foreground">
                {t("Nenhum arquivo nesta base ainda.")}
              </div>
            )}
          </section>
        )}
      </SectionBody>
    </>
  );
}
