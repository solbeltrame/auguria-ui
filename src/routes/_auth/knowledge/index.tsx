import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent, ReactNode, RefObject } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Globe2,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import SectionItem from "@/components/SectionItem";
import Switch from "@/components/Switch";
import { useTranslation } from "@/hooks/useTranslation";
import { useResizable } from "@/hooks/useResizable";
import { useCurrentAgent } from "@/queries/useAgents";
import {
  useCreateKnowledgeBase,
  useCreateKnowledgeLink,
  useDeleteKnowledgeBase,
  useDeleteKnowledgeDocument,
  useDuplicateKnowledgeBase,
  useKnowledgeBases,
  useKnowledgeDocuments,
  useReprocessKnowledgeDocument,
  useSynthesizeKnowledgeBase,
  useUpdateKnowledgeBase,
  useUpdateKnowledgeDocument,
  useUploadKnowledgeDocument,
} from "@/queries/useKnowledge";
import type { KnowledgeDocumentRow } from "@/supabase/client";

export const Route = createFileRoute("/_auth/knowledge/")({
  component: KnowledgeBasesPage,
});

const ACCEPTED_FILES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.html,.rtf,.sql,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm";
const MAX_INSTRUCTIONS = 60_000;
const MIN_SOURCES_WIDTH = 280;
const SOURCE_EXAMPLES = [
  "uma tabela de preços",
  "um manual de usuário",
  "um script de atendimento",
  "as políticas da sua empresa",
  "um catálogo de produtos",
];

type SourceMode = "text" | "sites";

function getSourcesMaxWidth(): number {
  return Math.max(
    MIN_SOURCES_WIDTH + 1,
    Math.min(560, Math.floor(window.innerWidth * 0.46)),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "link";
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(date);
}

function statusLabel(
  document: KnowledgeDocumentRow,
  translate: (value: string) => string,
): ReactNode {
  switch (document.status) {
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {translate("Pronto")}
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          {translate("Processando")}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          {translate("Erro")}
        </span>
      );
    default:
      return (
        <span className="text-[12px] text-muted-foreground">
          {translate("Na fila")}
        </span>
      );
  }
}

function sourceIcon(document: KnowledgeDocumentRow, className = "h-5 w-5") {
  return document.source_type === "url" ? (
    <Link2 className={`${className} text-primary`} />
  ) : (
    <FileText className={`${className} text-primary`} />
  );
}

function parseSiteUrls(value: string): string[] {
  const urls = value
    .split(/[\s,]+/)
    .map((item) => item.replace(/[)\]}>,.;]+$/g, ""))
    .filter(Boolean)
    .filter((item) => {
      try {
        const url = new URL(item);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    });
  return [...new Set(urls)];
}

function titleForUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Site";
  }
}

function sourceTitleForDocument(document: KnowledgeDocumentRow): string {
  return document.title?.trim() || document.file_name;
}

type AddSourcesModalProps = {
  isOpen: boolean;
  mode: SourceMode;
  draft: string;
  title: string;
  files: File[];
  error?: string;
  isBusy: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onModeChange: (mode: SourceMode) => void;
  onDraftChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onSelectFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onSubmit: () => void;
};

function AddSourcesModal({
  isOpen,
  mode,
  draft,
  title,
  files,
  error,
  isBusy,
  fileInputRef,
  onClose,
  onModeChange,
  onDraftChange,
  onTitleChange,
  onSelectFiles,
  onRemoveFile,
  onSubmit,
}: AddSourcesModalProps) {
  const { translate: t } = useTranslation();
  const [exampleIndex, setExampleIndex] = useState(0);
  const [exampleVisible, setExampleVisible] = useState(true);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setExampleIndex(0);
    setExampleVisible(true);
    let fadeTimer: number | undefined;
    const timer = window.setInterval(() => {
      setExampleVisible(false);
      fadeTimer = window.setTimeout(() => {
        setExampleIndex((current) => (current + 1) % SOURCE_EXAMPLES.length);
        setExampleVisible(true);
      }, 320);
    }, 2300);
    return () => {
      window.clearInterval(timer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setModeMenuOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const hasInput = Boolean(draft.trim() || files.length);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onSelectFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-sources-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-[840px] flex-col overflow-hidden rounded-[28px] border border-border bg-background p-4 shadow-2xl sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 text-center">
            <h2
              id="add-sources-title"
              className="text-[24px] font-medium tracking-tight text-foreground sm:text-[32px]"
            >
              {t("Ensine o agente com fontes como")}
            </h2>
            <div
              className={`mt-1 min-h-[34px] transform bg-gradient-to-r from-violet-500 via-sky-500 to-emerald-500 bg-clip-text text-[21px] font-medium text-transparent transition-all duration-500 ease-out sm:text-[27px] ${exampleVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
              aria-live="polite"
            >
              {t(SOURCE_EXAMPLES[exampleIndex])}
            </div>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title={t("Fechar")}
            aria-label={t("Fechar")}
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-5 sm:mt-6">
          <label
            className="mb-1.5 block px-1 text-[13px] font-medium text-foreground"
            htmlFor="knowledge-source-title"
          >
            {t("Título da fonte")}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("opcional")})
            </span>
          </label>
          <input
            id="knowledge-source-title"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder={t("Ex.: Tabela de preços 2026")}
            maxLength={160}
          />
          <p className="mt-1 px-1 text-[12px] text-muted-foreground">
            {t(
              "Esse nome aparece na lista de fontes. Ao adicionar várias de uma vez, você pode ajustar cada título depois.",
            )}
          </p>
        </div>

        <div className="mt-4 rounded-[24px] border-2 border-primary/60 bg-background shadow-sm transition focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_15%,transparent)]">
          <textarea
            className="min-h-[112px] w-full resize-none rounded-t-[22px] bg-transparent px-4 py-3 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground sm:min-h-[132px] sm:px-5 sm:py-4 sm:text-[16px]"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={
              mode === "sites"
                ? t("Cole um ou mais links públicos, um por linha")
                : t(
                    "Cole aqui informações, regras, políticas ou instruções para o agente",
                  )
            }
            aria-label={
              mode === "sites" ? t("Links das fontes") : t("Texto da fonte")
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-[14px] font-medium text-foreground transition hover:bg-muted"
                aria-haspopup="menu"
                aria-expanded={modeMenuOpen}
                onClick={() => setModeMenuOpen((current) => !current)}
              >
                {mode === "sites" ? (
                  <Globe2 className="h-4 w-4 text-primary" />
                ) : (
                  <Type className="h-4 w-4 text-primary" />
                )}
                {mode === "sites" ? t("Sites") : t("Texto")}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {modeMenuOpen && (
                <div
                  className="absolute bottom-[calc(100%+8px)] left-0 z-10 min-w-[150px] rounded-xl border border-border bg-background p-1 shadow-xl"
                  role="menu"
                >
                  {(["text", "sites"] as SourceMode[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[14px] transition hover:bg-muted ${mode === option ? "bg-primary/10 text-primary" : "text-foreground"}`}
                      role="menuitem"
                      onClick={() => {
                        onModeChange(option);
                        setModeMenuOpen(false);
                      }}
                    >
                      {option === "sites" ? (
                        <Globe2 className="h-4 w-4" />
                      ) : (
                        <Type className="h-4 w-4" />
                      )}
                      {option === "sites" ? t("Sites") : t("Texto")}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[12px] text-muted-foreground">
              {mode === "sites"
                ? t("Um link por linha")
                : t("Texto livre para ensinar o agente")}
            </span>
          </div>
        </div>

        <div
          className="mt-4 rounded-[22px] border border-dashed border-border bg-muted/25 px-4 py-5 text-center transition hover:border-primary/50 hover:bg-primary/5 sm:py-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <Upload className="mx-auto h-7 w-7 text-primary" />
          <p className="mt-2 text-[20px] font-medium text-foreground sm:text-[22px]">
            {t("ou solte arquivos")}
          </p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {t("PDF, imagens, documentos, áudio e outros")}
          </p>
          <label className="mx-auto mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-[14px] font-medium text-foreground shadow-sm transition hover:border-primary hover:text-primary sm:mt-4">
            <Upload className="h-4 w-4" />
            {t("Enviar arquivos")}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="sr-only"
              onChange={(event) =>
                onSelectFiles(Array.from(event.target.files || []))
              }
            />
          </label>
          <p className="mt-3 text-[12px] text-muted-foreground">
            {t("Até 20 MB por arquivo")}
          </p>
        </div>

        {!!files.length && (
          <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-1">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}-${index}`}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] text-foreground"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t("Remover arquivo")}
                    aria-label={`${t("Remover arquivo")} ${file.name}`}
                    onClick={() => onRemoveFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 sm:mt-5">
          <button
            type="button"
            className="rounded-full px-5 py-2.5 text-[14px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            {t("Cancelar")}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
            disabled={isBusy || !hasInput}
            onClick={onSubmit}
          >
            {isBusy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isBusy ? t("Interpretando...") : t("Adicionar fontes")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBaseWorkspace({ baseId }: { baseId: string }) {
  const { translate: t } = useTranslation();
  const { data: currentAgent } = useCurrentAgent();
  const { data: bases, isLoading: basesLoading } = useKnowledgeBases();
  const createBase = useCreateKnowledgeBase();
  const deleteBase = useDeleteKnowledgeBase();
  const duplicateBase = useDuplicateKnowledgeBase();
  const updateBase = useUpdateKnowledgeBase();
  const synthesizeBase = useSynthesizeKnowledgeBase();
  const uploadDocument = useUploadKnowledgeDocument();
  const createLink = useCreateKnowledgeLink();
  const updateDocument = useUpdateKnowledgeDocument();
  const deleteDocument = useDeleteKnowledgeDocument();
  const reprocessDocument = useReprocessKnowledgeDocument();
  const [selectedBaseId, setSelectedBaseId] = useState<string | undefined>(
    baseId,
  );
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [showBaseForm, setShowBaseForm] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [editingDocumentTitle, setEditingDocumentTitle] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [showAddSources, setShowAddSources] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [generatedContext, setGeneratedContext] = useState("");
  const [uploadError, setUploadError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const hydratedBaseId = useRef<string | undefined>(undefined);
  const hydratedDocumentId = useRef<string | undefined>(undefined);
  const getMaxSourcesWidth = useCallback(getSourcesMaxWidth, []);
  const {
    width: sourcesWidth,
    panelRef: sourcesPanelRef,
    handleMouseDown: handleSourcesMouseDown,
  } = useResizable({
    minWidth: MIN_SOURCES_WIDTH,
    getMaxWidth: getMaxSourcesWidth,
  });

  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const selectedBase = bases?.find((base) => base.id === selectedBaseId);
  const { data: documents, isLoading: documentsLoading } =
    useKnowledgeDocuments(selectedBase?.id);
  const selectedDocument = documents?.find(
    (document) => document.id === selectedDocumentId,
  );
  const addSourcesBusy =
    uploadDocument.isPending ||
    createLink.isPending ||
    synthesizeBase.isPending;

  useEffect(() => {
    if (baseId) {
      if (selectedBaseId !== baseId) setSelectedBaseId(baseId);
      return;
    }
    if (!bases?.length) {
      setSelectedBaseId(undefined);
      return;
    }
    if (!selectedBaseId || !bases.some((base) => base.id === selectedBaseId)) {
      setSelectedBaseId(bases[0].id);
    }
  }, [baseId, bases, selectedBaseId]);

  useEffect(() => {
    if (!selectedBase || hydratedBaseId.current === selectedBase.id) return;
    hydratedBaseId.current = selectedBase.id;
    setInstructions(selectedBase.instructions || "");
    setGeneratedContext(selectedBase.generated_context || "");
    setSelectedDocumentId(undefined);
    hydratedDocumentId.current = undefined;
    setEditingDocumentTitle("");
    setUploadError(undefined);
    setFeedback(undefined);
  }, [selectedBase]);

  useEffect(() => {
    if (
      selectedDocumentId &&
      !documents?.some((document) => document.id === selectedDocumentId)
    ) {
      setSelectedDocumentId(undefined);
    }
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocument) {
      hydratedDocumentId.current = undefined;
      setEditingDocumentTitle("");
      return;
    }
    if (hydratedDocumentId.current === selectedDocument.id) return;
    hydratedDocumentId.current = selectedDocument.id;
    setEditingDocumentTitle(sourceTitleForDocument(selectedDocument));
  }, [selectedDocument]);

  const consolidate = async (baseId: string) => {
    const base = await synthesizeBase.mutateAsync(baseId);
    setGeneratedContext(base.generated_context || "");
  };

  const openAddSources = () => {
    setSourceMode("text");
    setSourceDraft("");
    setSourceTitle("");
    setSourceFiles([]);
    setUploadError(undefined);
    setShowAddSources(true);
  };

  const closeAddSources = () => {
    if (addSourcesBusy) return;
    setShowAddSources(false);
    setSourceDraft("");
    setSourceTitle("");
    setSourceFiles([]);
    setUploadError(undefined);
  };

  const handleCreateBase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name || !isAdmin) return;
    createBase.mutate(
      { name, description: baseDescription.trim() || undefined },
      {
        onSuccess: (base) => {
          setBaseName("");
          setBaseDescription("");
          setShowBaseForm(false);
          setSelectedBaseId(base.id);
          setFeedback(t("Base criada. Vincule-a a um agente para ativá-la."));
        },
        onError: (error) => setUploadError(errorMessage(error)),
      },
    );
  };

  const handleDuplicateBase = () => {
    if (!selectedBase || !isAdmin) return;
    const name = window
      .prompt(t("Nome da nova base"), `${selectedBase.name} — cópia`)
      ?.trim();
    if (!name) return;
    setUploadError(undefined);
    setFeedback(undefined);
    duplicateBase.mutate(
      {
        baseId: selectedBase.id,
        name,
        description: selectedBase.description || undefined,
      },
      {
        onSuccess: (base) => {
          setSelectedBaseId(base.id);
          setFeedback(
            t("Base duplicada com fontes independentes para você testar."),
          );
        },
        onError: (error) => setUploadError(errorMessage(error)),
      },
    );
  };

  const handleDeleteBase = () => {
    if (!selectedBase || !isAdmin) return;
    if (
      !window.confirm(
        `${t("Excluir a base e suas fontes vinculadas")}? “${selectedBase.name}”`,
      )
    ) {
      return;
    }
    deleteBase.mutate(selectedBase.id, {
      onSuccess: () => {
        setSelectedBaseId(undefined);
        setSelectedDocumentId(undefined);
        setFeedback(t("Base excluída."));
      },
      onError: (error) => setUploadError(errorMessage(error)),
    });
  };

  const handleSaveInstructions = () => {
    if (!selectedBase || !isAdmin) return;
    setFeedback(undefined);
    updateBase.mutate(
      { baseId: selectedBase.id, instructions },
      {
        onSuccess: (base) => {
          setInstructions(base.instructions || "");
          setFeedback(t("Instruções manuais salvas."));
        },
        onError: (error) => setUploadError(errorMessage(error)),
      },
    );
  };

  const handleSynthesize = async () => {
    if (!selectedBase || !isAdmin) return;
    setFeedback(undefined);
    setUploadError(undefined);
    try {
      await consolidate(selectedBase.id);
      setFeedback(t("Contexto atualizado a partir das fontes ativas."));
    } catch (error) {
      setUploadError(errorMessage(error));
    }
  };

  const handleSelectFiles = (files: File[]) => {
    setSourceFiles((current) => {
      const next = [...current, ...files];
      return next.filter(
        (file, index) =>
          next.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified,
          ) === index,
      );
    });
    setUploadError(undefined);
  };

  const handleAddSources = async () => {
    if (!selectedBase || !isAdmin) return;
    const draft = sourceDraft.trim();
    const title = sourceTitle.trim() || undefined;
    const files = [...sourceFiles];
    const urls = sourceMode === "sites" ? parseSiteUrls(draft) : [];

    if (sourceMode === "sites" && draft && !urls.length) {
      setUploadError(t("Digite pelo menos um link público válido."));
      return;
    }

    if (sourceMode === "text" && draft) {
      files.push(
        new File([draft], `texto-colado-${Date.now()}.txt`, {
          type: "text/plain",
        }),
      );
    }

    if (!files.length && !urls.length) {
      setUploadError(t("Adicione um texto, um link ou pelo menos um arquivo."));
      return;
    }

    setUploadError(undefined);
    setFeedback(undefined);
    const failures: string[] = [];
    let successCount = 0;

    for (const file of files) {
      try {
        await uploadDocument.mutateAsync({
          baseId: selectedBase.id,
          file,
          title,
        });
        successCount += 1;
      } catch (error) {
        failures.push(`${file.name}: ${errorMessage(error)}`);
      }
    }

    for (const url of urls) {
      try {
        await createLink.mutateAsync({
          baseId: selectedBase.id,
          url,
          title: title || titleForUrl(url),
        });
        successCount += 1;
      } catch (error) {
        failures.push(`${url}: ${errorMessage(error)}`);
      }
    }

    if (successCount > 0) {
      try {
        await consolidate(selectedBase.id);
        setFeedback(t("Fontes adicionadas e contexto atualizado."));
      } catch (error) {
        failures.push(
          t("Não foi possível consolidar o contexto: ") + errorMessage(error),
        );
      }
      setShowAddSources(false);
      setSourceDraft("");
      setSourceTitle("");
      setSourceFiles([]);
    }

    if (failures.length) setUploadError(failures.join("\n"));
  };

  const handleToggle = async (
    document: KnowledgeDocumentRow,
    active: boolean,
  ) => {
    if (!isAdmin) return;
    setUploadError(undefined);
    try {
      await updateDocument.mutateAsync({ document, active });
      if (selectedBase) await consolidate(selectedBase.id);
      setFeedback(active ? t("Fonte ativada.") : t("Fonte desativada."));
    } catch (error) {
      setUploadError(errorMessage(error));
    }
  };

  const handleSaveDocumentTitle = async () => {
    if (!selectedDocument || !isAdmin) return;
    const title = editingDocumentTitle.trim();
    if (!title) {
      setUploadError(t("Informe um título para a fonte."));
      return;
    }
    setUploadError(undefined);
    setFeedback(undefined);
    try {
      const updated = await updateDocument.mutateAsync({
        document: selectedDocument,
        title,
      });
      setEditingDocumentTitle(sourceTitleForDocument(updated));
      if (selectedBase) await consolidate(selectedBase.id);
      setFeedback(t("Título da fonte salvo."));
    } catch (error) {
      setUploadError(errorMessage(error));
    }
  };

  const handleDeleteDocument = (document: KnowledgeDocumentRow) => {
    if (!isAdmin) return;
    if (
      !window.confirm(
        `${t("Excluir a fonte")} “${sourceTitleForDocument(document)}”?`,
      )
    )
      return;
    deleteDocument.mutate(document, {
      onSuccess: () => {
        if (selectedDocumentId === document.id)
          setSelectedDocumentId(undefined);
        if (selectedBase) void consolidate(selectedBase.id);
      },
      onError: (error) => setUploadError(errorMessage(error)),
    });
  };

  const handleReprocessDocument = (document: KnowledgeDocumentRow) => {
    if (!isAdmin || document.status !== "error") return;
    reprocessDocument.mutate(document, {
      onSuccess: () => {
        if (selectedBase) void consolidate(selectedBase.id);
      },
      onError: (error) => setUploadError(errorMessage(error)),
    });
  };

  return (
    <>
      <SectionHeader title={selectedBase?.name || t("Base de conhecimento")} />

      <div className="section-body h-full w-full overflow-y-auto [scrollbar-gutter:stable]">
        <div className="flex min-h-full flex-col">
          {!baseId && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
                  <BookOpenText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {t("Conhecimento do agente")}
                  </p>
                  <p className="truncate text-[19px] font-medium text-foreground">
                    {selectedBase?.name || t("Nenhuma base selecionada")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {bases?.length ? (
                  <select
                    className="!w-auto min-w-[170px] rounded-xl border border-border bg-background px-3 py-2 text-[14px] text-foreground !outline-none"
                    value={selectedBase?.id || ""}
                    onChange={(event) => {
                      setSelectedBaseId(event.target.value || undefined);
                      setSelectedDocumentId(undefined);
                    }}
                    aria-label={t("Base selecionada")}
                  >
                    {bases.map((base) => (
                      <option key={base.id} value={base.id}>
                        {base.name} —{" "}
                        {base.status === "active" ? t("ativa") : t("arquivada")}
                      </option>
                    ))}
                  </select>
                ) : null}
                {isAdmin && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                    onClick={() => setShowBaseForm((current) => !current)}
                    disabled={createBase.isPending}
                  >
                    <Plus className="h-4 w-4" />
                    {t("Nova base")}
                  </button>
                )}
                {selectedBase && isAdmin && (
                  <>
                    <button
                      type="button"
                      className="rounded-full border border-border px-4 py-2 text-[14px] font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                      onClick={handleDuplicateBase}
                      disabled={duplicateBase.isPending}
                    >
                      {duplicateBase.isPending
                        ? t("Duplicando...")
                        : t("Duplicar")}
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-destructive/30 px-4 py-2 text-[14px] font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                      onClick={handleDeleteBase}
                      disabled={deleteBase.isPending}
                    >
                      <Trash2 className="mr-1 inline h-4 w-4" />
                      {t("Excluir")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {!baseId && showBaseForm && isAdmin && (
            <form
              className="!m-0 !flex !grow-0 !flex-col !gap-3 border-b border-border bg-muted/20 px-5 py-4 md:!flex-row"
              onSubmit={handleCreateBase}
            >
              <input
                className="text rounded-xl border border-border px-3 py-2 !outline-none"
                value={baseName}
                onChange={(event) => setBaseName(event.target.value)}
                placeholder={t("Nome da base")}
                maxLength={120}
                required
              />
              <input
                className="text rounded-xl border border-border px-3 py-2 !outline-none"
                value={baseDescription}
                onChange={(event) => setBaseDescription(event.target.value)}
                placeholder={t("Descrição opcional")}
                maxLength={500}
              />
              <button
                type="submit"
                className="rounded-full bg-primary px-5 py-2 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                disabled={createBase.isPending || !baseName.trim()}
              >
                {createBase.isPending ? t("Criando...") : t("Criar base")}
              </button>
            </form>
          )}

          {basesLoading ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : selectedBase ? (
            <div
              className="grid min-h-[calc(100dvh-145px)] flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]"
              style={
                sourcesWidth !== null
                  ? {
                      gridTemplateColumns: `${sourcesWidth}px minmax(0, 1fr)`,
                    }
                  : undefined
              }
            >
              <div ref={sourcesPanelRef} className="relative min-h-0 h-full">
                <aside className="flex h-full min-h-0 flex-col border-b border-border bg-sidebar/30 lg:border-b-0 lg:border-r">
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={t("Redimensionar painel de fontes")}
                    className="absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize lg:block"
                    onMouseDown={handleSourcesMouseDown}
                  />
                  <div className="border-b border-border px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[20px] font-medium text-foreground">
                          {t("Fontes")}
                        </h2>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {documents?.length || 0} {t("fonte(s) nesta base")}
                        </p>
                      </div>
                      {documentsLoading && (
                        <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 py-2.5 text-[14px] font-medium text-primary transition hover:bg-primary/10"
                        onClick={openAddSources}
                      >
                        <Plus className="h-4 w-4" />
                        {t("Adicionar fontes")}
                      </button>
                    )}
                  </div>

                  <div className="border-b border-border px-3 py-3">
                    <button
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${!selectedDocumentId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"}`}
                      onClick={() => setSelectedDocumentId(undefined)}
                    >
                      <BookOpenText className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">
                          {t("Contexto consolidado")}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-muted-foreground">
                          {t("Visão geral da base")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    {!documentsLoading && !documents?.length && (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
                        <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
                        <p className="mt-3 text-[14px] font-medium text-foreground">
                          {t("Nenhuma fonte adicionada ainda")}
                        </p>
                        <p className="mt-1 text-[12px] text-muted-foreground">
                          {t("Adicione arquivos, texto ou sites para começar.")}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {documents?.map((document) => {
                        const active = document.active !== false;
                        const selected = selectedDocumentId === document.id;
                        return (
                          <div
                            key={document.id}
                            className={`flex items-center gap-2 rounded-xl border px-2 py-2 transition ${selected ? "border-primary/30 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/60"}`}
                          >
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              aria-expanded={selected}
                              onClick={() => setSelectedDocumentId(document.id)}
                            >
                              <span className="shrink-0">
                                {sourceIcon(document)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                  <span className="truncate text-[14px] font-medium text-foreground">
                                    {sourceTitleForDocument(document)}
                                  </span>
                                </span>
                                <span className="mt-1 block pl-4">
                                  {statusLabel(document, t)}
                                </span>
                              </span>
                              <ChevronRight
                                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${selected ? "rotate-90" : ""}`}
                              />
                            </button>
                            <div
                              className="shrink-0"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Switch
                                checked={active}
                                onCheckedChange={(checked) =>
                                  void handleToggle(document, checked)
                                }
                                disabled={!isAdmin || updateDocument.isPending}
                                aria-label={
                                  active ? t("Fonte ativa") : t("Fonte inativa")
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </aside>
              </div>

              <main className="flex min-h-0 min-w-0 flex-col bg-background">
                {selectedDocument ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <button
                          type="button"
                          className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          title={t("Voltar para o contexto")}
                          aria-label={t("Voltar para o contexto")}
                          onClick={() => setSelectedDocumentId(undefined)}
                        >
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="rounded-xl bg-primary/10 p-2 text-primary">
                          {sourceIcon(selectedDocument, "h-5 w-5")}
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-[20px] font-medium text-foreground">
                            {sourceTitleForDocument(selectedDocument)}
                          </h2>
                          {selectedDocument.title !==
                            selectedDocument.file_name && (
                            <p className="mt-1 truncate text-[12px] text-muted-foreground">
                              {selectedDocument.file_name}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            {statusLabel(selectedDocument, t)}
                            <span className="text-[12px] text-muted-foreground">
                              {formatBytes(selectedDocument.file_size)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={selectedDocument.active !== false}
                          onCheckedChange={(checked) =>
                            void handleToggle(selectedDocument, checked)
                          }
                          disabled={!isAdmin || updateDocument.isPending}
                          aria-label={
                            selectedDocument.active !== false
                              ? t("Fonte ativa")
                              : t("Fonte inativa")
                          }
                        />
                        {selectedDocument.status === "error" && isAdmin && (
                          <button
                            type="button"
                            className="rounded-full p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                            title={t("Tentar processar novamente")}
                            onClick={() =>
                              handleReprocessDocument(selectedDocument)
                            }
                            disabled={reprocessDocument.isPending}
                          >
                            <RefreshCcw
                              className={`h-5 w-5 ${reprocessDocument.isPending ? "animate-spin" : ""}`}
                            />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            type="button"
                            className="rounded-full p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                            title={t("Excluir fonte")}
                            onClick={() =>
                              handleDeleteDocument(selectedDocument)
                            }
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                      <div className="mx-auto flex max-w-[940px] flex-col gap-5">
                        <section className="rounded-2xl border border-border p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-[16px] font-medium text-foreground">
                                {t("Título da fonte")}
                              </h3>
                              <p className="mt-1 text-[13px] text-muted-foreground">
                                {t(
                                  "Use um nome curto para encontrar esta fonte rapidamente na lista.",
                                )}
                              </p>
                            </div>
                            <span className="text-[12px] text-muted-foreground">
                              {editingDocumentTitle.length} / 160
                            </span>
                          </div>
                          <input
                            className="mt-4 w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-[15px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                            value={editingDocumentTitle}
                            onChange={(event) =>
                              setEditingDocumentTitle(
                                event.target.value.slice(0, 160),
                              )
                            }
                            maxLength={160}
                            readOnly={!isAdmin}
                            aria-label={t("Título da fonte")}
                          />
                          {isAdmin && (
                            <button
                              type="button"
                              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
                              disabled={
                                updateDocument.isPending ||
                                !editingDocumentTitle.trim() ||
                                editingDocumentTitle.trim() ===
                                  sourceTitleForDocument(selectedDocument)
                              }
                              onClick={() => void handleSaveDocumentTitle()}
                            >
                              <Save className="h-4 w-4" />
                              {updateDocument.isPending
                                ? t("Salvando...")
                                : t("Salvar título")}
                            </button>
                          )}
                        </section>

                        {selectedDocument.source_url && (
                          <a
                            className="flex items-start gap-2 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-[14px] text-primary underline decoration-primary/40 underline-offset-2 hover:bg-primary/5"
                            href={selectedDocument.source_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Globe2 className="mt-0.5 h-4 w-4 shrink-0 no-underline" />
                            <span className="break-all">
                              {selectedDocument.source_url}
                            </span>
                          </a>
                        )}

                        <section className="rounded-2xl border border-border p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-[16px] font-medium text-foreground">
                                {t("Conteúdo interpretado")}
                              </h3>
                              <p className="mt-1 text-[13px] text-muted-foreground">
                                {t(
                                  "É este conteúdo que poderá ser consultado pelo agente.",
                                )}
                              </p>
                            </div>
                            <span className="text-[12px] text-muted-foreground">
                              {formatDate(selectedDocument.updated_at)}
                            </span>
                          </div>
                          <textarea
                            className="mt-4 min-h-[420px] w-full resize-y rounded-xl border border-border bg-muted/20 px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
                            value={
                              selectedDocument.extracted_text ||
                              (selectedDocument.status === "processing"
                                ? t(
                                    "Esta fonte ainda está sendo interpretada...",
                                  )
                                : t("Nenhum conteúdo interpretado disponível."))
                            }
                            readOnly
                            aria-label={t("Conteúdo interpretado")}
                          />
                        </section>

                        {selectedDocument.error_message && (
                          <p className="whitespace-pre-line rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                            {selectedDocument.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {t("Visão geral")}
                        </p>
                        <h2 className="mt-1 text-[24px] font-medium tracking-tight text-foreground">
                          {t("Contexto consolidado")}
                        </h2>
                        <p className="mt-1 max-w-[680px] text-[14px] text-muted-foreground">
                          {t(
                            "O agente combina as fontes ativas com os ajustes manuais desta base. Em caso de conflito, os ajustes manuais têm prioridade.",
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-4 py-2 text-[14px] font-medium text-primary transition hover:bg-primary/10"
                            onClick={openAddSources}
                          >
                            <Plus className="h-4 w-4" />
                            {t("Adicionar fontes")}
                          </button>
                        )}
                        {synthesizeBase.isPending && (
                          <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                        )}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-5">
                      <div className="mx-auto flex max-w-[940px] flex-col gap-5">
                        <section className="rounded-2xl border border-border p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-primary" />
                                <h3 className="text-[16px] font-medium text-foreground">
                                  {t("Contexto automático")}
                                </h3>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {t("somente leitura")}
                                </span>
                              </div>
                              <p className="mt-1 text-[13px] text-muted-foreground">
                                {t(
                                  "Gerado a partir das fontes ativas e atualizado quando elas mudam.",
                                )}
                              </p>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[13px] font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                                onClick={() => void handleSynthesize()}
                                disabled={synthesizeBase.isPending}
                              >
                                <RefreshCcw
                                  className={`h-4 w-4 ${synthesizeBase.isPending ? "animate-spin" : ""}`}
                                />
                                {t("Reinterpretar")}
                              </button>
                            )}
                          </div>
                          <textarea
                            className="mt-4 min-h-[300px] w-full resize-y rounded-xl border border-border bg-muted/20 px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
                            value={generatedContext}
                            readOnly
                            placeholder={t(
                              "Adicione fontes ativas para gerar o contexto consolidado...",
                            )}
                            aria-label={t("Contexto automático")}
                          />
                        </section>

                        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h3 className="text-[16px] font-medium text-foreground">
                                {t("Ajustes manuais")}
                              </h3>
                              <p className="mt-1 max-w-[720px] text-[13px] text-muted-foreground">
                                {t(
                                  "Use para regras confirmadas que não estão nas fontes. Este texto tem prioridade em caso de conflito e nunca é apagado ao reinterpretar os arquivos.",
                                )}
                              </p>
                            </div>
                            <span className="text-[12px] text-muted-foreground">
                              {instructions.length.toLocaleString("pt-BR")} /{" "}
                              {MAX_INSTRUCTIONS.toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <textarea
                            className="mt-4 min-h-[190px] w-full resize-y rounded-xl border border-border bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
                            value={instructions}
                            onChange={(event) =>
                              setInstructions(
                                event.target.value.slice(0, MAX_INSTRUCTIONS),
                              )
                            }
                            placeholder={t(
                              "Ex.: nunca prometa prazo sem consultar a equipe...",
                            )}
                            maxLength={MAX_INSTRUCTIONS}
                            readOnly={!isAdmin}
                            aria-label={t("Ajustes manuais")}
                          />
                          {isAdmin && (
                            <button
                              type="button"
                              className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-default disabled:opacity-50"
                              disabled={
                                updateBase.isPending ||
                                instructions ===
                                  (selectedBase.instructions || "")
                              }
                              onClick={handleSaveInstructions}
                            >
                              <Save className="h-4 w-4" />
                              {updateBase.isPending
                                ? t("Salvando...")
                                : t("Salvar ajustes")}
                            </button>
                          )}
                        </section>

                        {feedback && (
                          <p className="rounded-xl bg-primary/10 px-4 py-3 text-[13px] text-primary">
                            {feedback}
                          </p>
                        )}
                        {uploadError && !showAddSources && (
                          <p className="whitespace-pre-line rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
                            {uploadError}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-[470px] rounded-3xl border border-dashed border-border px-6 py-12 text-center">
                <BookOpenText className="mx-auto h-10 w-10 text-primary" />
                <h2 className="mt-4 text-[22px] font-medium text-foreground">
                  {t("Comece uma base de conhecimento")}
                </h2>
                <p className="mt-2 text-[14px] text-muted-foreground">
                  {t(
                    "Organize arquivos, textos e sites em um contexto que pode ser compartilhado por vários agentes.",
                  )}
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[14px] font-medium text-primary-foreground transition hover:bg-primary/90"
                    onClick={() => setShowBaseForm(true)}
                  >
                    <Plus className="h-4 w-4" />
                    {t("Criar primeira base")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AddSourcesModal
        isOpen={showAddSources}
        mode={sourceMode}
        draft={sourceDraft}
        title={sourceTitle}
        files={sourceFiles}
        error={uploadError}
        isBusy={addSourcesBusy}
        fileInputRef={fileInput}
        onClose={closeAddSources}
        onModeChange={(mode) => {
          setSourceMode(mode);
          setSourceDraft("");
          setUploadError(undefined);
        }}
        onDraftChange={setSourceDraft}
        onTitleChange={setSourceTitle}
        onSelectFiles={handleSelectFiles}
        onRemoveFile={(index) =>
          setSourceFiles((current) =>
            current.filter((_, item) => item !== index),
          )
        }
        onSubmit={() => void handleAddSources()}
      />
    </>
  );
}

function KnowledgeBasesPage() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: bases, isLoading } = useKnowledgeBases();
  const { data: currentAgent } = useCurrentAgent();
  const createBase = useCreateKnowledgeBase();
  const duplicateBase = useDuplicateKnowledgeBase();
  const deleteBase = useDeleteKnowledgeBase();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !isAdmin) return;
    setError(undefined);
    createBase.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
      },
      {
        onSuccess: (base) => {
          setName("");
          setDescription("");
          setShowCreateForm(false);
          void navigate({
            to: `/knowledge/${base.id}`,
            hash: (previousHash) => previousHash!,
          });
        },
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  const handleDuplicate = (base: NonNullable<typeof bases>[number]) => {
    if (!isAdmin) return;
    const copyName = window
      .prompt(t("Nome da nova base"), `${base.name} — cópia`)
      ?.trim();
    if (!copyName) return;
    setError(undefined);
    setFeedback(undefined);
    duplicateBase.mutate(
      {
        baseId: base.id,
        name: copyName,
        description: base.description || undefined,
      },
      {
        onSuccess: (duplicatedBase) => {
          setFeedback(t("Base duplicada com fontes independentes."));
          void navigate({
            to: `/knowledge/${duplicatedBase.id}`,
            hash: (previousHash) => previousHash!,
          });
        },
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    );
  };

  const handleDelete = (base: NonNullable<typeof bases>[number]) => {
    if (!isAdmin) return;
    if (
      !window.confirm(
        `${t("Excluir a base e suas fontes vinculadas")}? “${base.name}”`,
      )
    ) {
      return;
    }
    setError(undefined);
    deleteBase.mutate(base.id, {
      onSuccess: () => setFeedback(t("Base excluída.")),
      onError: (mutationError) => setError(errorMessage(mutationError)),
    });
  };

  return (
    <>
      <SectionHeader title={t("Base de conhecimento")} />

      <SectionBody>
        <SectionItem
          title={t("Criar nova base")}
          description={t("Comece um contexto isolado para seus agentes")}
          aside={
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Plus className="h-6 w-6" />
            </div>
          }
          onClick={() => {
            setError(undefined);
            setShowCreateForm((current) => !current);
          }}
          disabled={!isAdmin}
          disabledReason={t("Requer permissões de administrador")}
        />

        {showCreateForm && isAdmin && (
          <form
            className="mb-3 flex flex-col gap-2 rounded-2xl border border-border bg-muted/20 p-3"
            onSubmit={handleCreate}
          >
            <input
              className="text w-full rounded-xl border border-border px-3 py-2 !outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("Nome da base")}
              maxLength={120}
              autoFocus
              required
            />
            <input
              className="text w-full rounded-xl border border-border px-3 py-2 !outline-none"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("Descrição opcional")}
              maxLength={500}
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="rounded-full px-3 py-2 text-[13px] text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => setShowCreateForm(false)}
              >
                {t("Cancelar")}
              </button>
              <button
                type="submit"
                className="rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                disabled={createBase.isPending || !name.trim()}
              >
                {createBase.isPending ? t("Criando...") : t("Criar base")}
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center p-10">
            <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : bases?.length ? (
          <div className="flex flex-col gap-1">
            {bases.map((base) => (
              <div
                key={base.id}
                className="group flex min-h-[76px] items-center rounded-xl transition hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left"
                  onClick={() =>
                    void navigate({
                      to: `/knowledge/${base.id}`,
                      hash: (previousHash) => previousHash!,
                    })
                  }
                >
                  <div className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary">
                    <BookOpenText className="h-5 w-5" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] text-foreground">
                      {base.name}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
                      <span
                        className={
                          base.status === "active"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }
                      >
                        {base.status === "active" ? t("Ativa") : t("Arquivada")}
                      </span>
                      {base.description && (
                        <span className="truncate">· {base.description}</span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-0.5 pr-2">
                    <button
                      type="button"
                      className="rounded-full p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                      title={t("Duplicar base")}
                      aria-label={`${t("Duplicar base")} ${base.name}`}
                      onClick={() => handleDuplicate(base)}
                      disabled={duplicateBase.isPending}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-full p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      title={t("Excluir base")}
                      aria-label={`${t("Excluir base")} ${base.name}`}
                      onClick={() => handleDelete(base)}
                      disabled={deleteBase.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <BookOpenText className="mx-auto h-9 w-9 text-primary" />
            <p className="mt-3 text-[15px] font-medium text-foreground">
              {t("Nenhuma base criada ainda")}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("Crie uma base para organizar fontes e contexto do agente.")}
            </p>
          </div>
        )}

        {feedback && (
          <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-[13px] text-primary">
            {feedback}
          </p>
        )}
        {error && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </SectionBody>
    </>
  );
}
