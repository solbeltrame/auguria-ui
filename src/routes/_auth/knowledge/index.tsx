import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import Button from "@/components/Button";
import Switch from "@/components/Switch";
import { useTranslation } from "@/hooks/useTranslation";
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
  component: KnowledgePage,
});

const ACCEPTED_FILES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.xml,.html,.rtf,.sql,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.mov,.webm";
const MAX_INSTRUCTIONS = 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "link";
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
  const [selectedBaseId, setSelectedBaseId] = useState<string>();
  const [baseName, setBaseName] = useState("");
  const [baseDescription, setBaseDescription] = useState("");
  const [showBaseForm, setShowBaseForm] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [instructions, setInstructions] = useState("");
  const [generatedContext, setGeneratedContext] = useState("");
  const [expandedSourceId, setExpandedSourceId] = useState<string>();
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [uploadError, setUploadError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const hydratedBaseId = useRef<string | undefined>(undefined);

  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const selectedBase = bases?.find((base) => base.id === selectedBaseId);
  const { data: documents, isLoading: documentsLoading } =
    useKnowledgeDocuments(selectedBase?.id);

  useEffect(() => {
    if (!bases?.length) {
      setSelectedBaseId(undefined);
      return;
    }
    if (!selectedBaseId || !bases.some((base) => base.id === selectedBaseId)) {
      setSelectedBaseId(bases[0].id);
    }
  }, [bases, selectedBaseId]);

  useEffect(() => {
    if (!selectedBase || hydratedBaseId.current === selectedBase.id) return;
    hydratedBaseId.current = selectedBase.id;
    setInstructions(selectedBase.instructions || "");
    setGeneratedContext(selectedBase.generated_context || "");
    setExpandedSourceId(undefined);
    setUploadError(undefined);
    setFeedback(undefined);
  }, [selectedBase]);

  useEffect(() => {
    if (
      expandedSourceId &&
      !documents?.some((document) => document.id === expandedSourceId)
    ) {
      setExpandedSourceId(undefined);
    }
  }, [documents, expandedSourceId]);

  const consolidate = async (baseId: string) => {
    const base = await synthesizeBase.mutateAsync(baseId);
    setInstructions(base.instructions || "");
    setGeneratedContext(base.generated_context || "");
  };

  const handleCreateBase = (event: React.FormEvent<HTMLFormElement>) => {
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
    )
      return;
    deleteBase.mutate(selectedBase.id, {
      onSuccess: () => {
        setSelectedBaseId(undefined);
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

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFiles(Array.from(event.target.files || []));
    setUploadError(undefined);
    setFeedback(undefined);
  };

  const handleUpload = async () => {
    if (!selectedBase || !selectedFiles.length) return;

    setUploadError(undefined);
    setFeedback(undefined);
    const failures: string[] = [];
    let uploaded = false;
    for (const file of selectedFiles) {
      try {
        await uploadDocument.mutateAsync({ baseId: selectedBase.id, file });
        uploaded = true;
      } catch (error) {
        failures.push(`${file.name}: ${errorMessage(error)}`);
      }
    }
    setSelectedFiles([]);
    if (fileInput.current) fileInput.current.value = "";

    if (uploaded) {
      try {
        await consolidate(selectedBase.id);
        setFeedback(t("Arquivos processados e contexto atualizado."));
      } catch (error) {
        failures.push(
          t("Não foi possível consolidar o contexto: ") + errorMessage(error),
        );
      }
    }
    if (failures.length) setUploadError(failures.join("\n"));
  };

  const handleAddLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBase || !linkUrl.trim()) return;
    setUploadError(undefined);
    setFeedback(undefined);
    try {
      await createLink.mutateAsync({
        baseId: selectedBase.id,
        url: linkUrl.trim(),
        title: linkTitle.trim() || undefined,
      });
      setLinkUrl("");
      setLinkTitle("");
      setShowLinkForm(false);
      await consolidate(selectedBase.id);
      setFeedback(t("Link adicionado e contexto atualizado."));
    } catch (error) {
      setUploadError(errorMessage(error));
    }
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

  const handleDeleteDocument = (document: KnowledgeDocumentRow) => {
    if (!isAdmin) return;
    if (!window.confirm(`${t("Excluir a fonte")} “${document.file_name}”?`))
      return;
    deleteDocument.mutate(document, {
      onSuccess: () => {
        if (selectedBase) void consolidate(selectedBase.id);
      },
    });
  };

  const handleReprocessDocument = (document: KnowledgeDocumentRow) => {
    if (!isAdmin || document.status !== "error") return;
    reprocessDocument.mutate(document, {
      onSuccess: () => {
        if (selectedBase) void consolidate(selectedBase.id);
      },
    });
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
                {t("Conhecimento organizado por contexto")}
              </h2>
              <p className="mt-1">
                {t(
                  "Crie bases por contexto, adicione arquivos e links na lateral e vincule cada base aos agentes que devem consultá-la.",
                )}
              </p>
            </div>
          </div>
        </section>

        {!basesLoading && (
          <section
            className="flex flex-col gap-3 rounded-xl border border-border p-[14px]"
            aria-labelledby="knowledge-bases"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="knowledge-bases"
                  className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {t("Bases")}
                </h2>
                <p className="mt-1 text-[13px]">
                  {t(
                    "Uma base pode ser compartilhada por vários agentes. Sem vínculo explícito, ela não entra no atendimento.",
                  )}
                </p>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => setShowBaseForm((current) => !current)}
                >
                  <Plus className="h-4 w-4" />
                  {t("Nova base")}
                </Button>
              )}
            </div>

            {!!bases?.length && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="text min-w-[220px] flex-1"
                  value={selectedBase?.id || ""}
                  onChange={(event) =>
                    setSelectedBaseId(event.target.value || undefined)
                  }
                  aria-label={t("Base selecionada")}
                >
                  {bases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.name} (
                      {base.status === "active" ? t("ativa") : t("arquivada")})
                    </option>
                  ))}
                </select>
                {selectedBase && isAdmin && (
                  <>
                    <Button
                      type="button"
                      className="secondary"
                      loading={duplicateBase.isPending}
                      onClick={handleDuplicateBase}
                    >
                      {t("Duplicar")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      loading={deleteBase.isPending}
                      onClick={handleDeleteBase}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("Excluir")}
                    </Button>
                  </>
                )}
              </div>
            )}

            {selectedBase?.description && (
              <p className="text-[13px] text-muted-foreground">
                {selectedBase.description}
              </p>
            )}

            {showBaseForm && isAdmin && (
              <form
                className="grid gap-2 rounded-lg border border-dashed border-primary/30 p-3 md:grid-cols-[1fr_1fr_auto]"
                onSubmit={handleCreateBase}
              >
                <input
                  className="text"
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  placeholder={t("Nome da base")}
                  maxLength={120}
                  required
                />
                <input
                  className="text"
                  value={baseDescription}
                  onChange={(event) => setBaseDescription(event.target.value)}
                  placeholder={t("Descrição opcional")}
                  maxLength={500}
                />
                <Button
                  type="submit"
                  className="primary"
                  loading={createBase.isPending}
                  invalid={!baseName.trim()}
                >
                  {t("Criar base")}
                </Button>
              </form>
            )}

            {!bases?.length && (
              <p className="text-[14px] text-muted-foreground">
                {isAdmin
                  ? t(
                      "Crie a primeira base para começar a organizar o conhecimento.",
                    )
                  : t("Ainda não há uma base de conhecimento cadastrada.")}
              </p>
            )}
          </section>
        )}

        {selectedBase && (
          <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
            <section
              className="flex min-w-0 flex-col gap-3"
              aria-labelledby="knowledge-sources"
            >
              <div className="flex items-center justify-between px-[10px]">
                <div>
                  <h2
                    id="knowledge-sources"
                    className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t("Fontes")}
                  </h2>
                  <p className="mt-1 text-[13px]">
                    {t(
                      "Fontes desta base. Ative só o que deve entrar no contexto.",
                    )}
                  </p>
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
                      {t("Adicionar arquivos")}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {t("PDF, Office, imagens, áudio e texto; até 20 MB")}
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
                        loading={
                          uploadDocument.isPending || synthesizeBase.isPending
                        }
                        onClick={() => void handleUpload()}
                      >
                        {t("Enviar e interpretar")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && (
                <div className="rounded-xl border border-border p-[14px]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left text-[14px] font-medium text-foreground"
                    onClick={() => setShowLinkForm((current) => !current)}
                  >
                    <Plus className="h-4 w-4 text-primary" />
                    {t("Adicionar link")}
                  </button>
                  {showLinkForm && (
                    <form
                      className="mt-3 flex flex-col gap-2"
                      onSubmit={handleAddLink}
                    >
                      <input
                        className="text"
                        type="url"
                        value={linkUrl}
                        onChange={(event) => setLinkUrl(event.target.value)}
                        placeholder="https://exemplo.com/ajuda"
                        required
                      />
                      <input
                        className="text"
                        value={linkTitle}
                        onChange={(event) => setLinkTitle(event.target.value)}
                        placeholder={t("Título opcional")}
                        maxLength={255}
                      />
                      <Button
                        type="submit"
                        className="primary"
                        loading={
                          createLink.isPending || synthesizeBase.isPending
                        }
                        invalid={!linkUrl.trim()}
                      >
                        {t("Adicionar e interpretar")}
                      </Button>
                    </form>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1">
                {documents?.map((document) => {
                  const active = document.active !== false;
                  const expanded = expandedSourceId === document.id;
                  const isLink = document.source_type === "url";
                  return (
                    <div
                      key={document.id}
                      className="rounded-xl border border-border"
                    >
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedSourceId(
                              expanded ? undefined : document.id,
                            )
                          }
                          aria-expanded={expanded}
                        >
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
                          />
                          {isLink ? (
                            <Link2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                          )}
                          <span className="min-w-0 truncate text-[14px] text-foreground">
                            {document.file_name}
                          </span>
                        </button>
                        <div onClick={(event) => event.stopPropagation()}>
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
                      {expanded && (
                        <div className="flex flex-col gap-2 border-t border-border px-3 py-3 text-[12px] text-muted-foreground">
                          {isLink && document.source_url && (
                            <a
                              className="break-all text-primary underline"
                              href={document.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {document.source_url}
                            </a>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{formatBytes(document.file_size)}</span>
                            {statusLabel(document, t)}
                          </div>
                          {document.error_message && (
                            <div className="text-destructive">
                              {document.error_message}
                            </div>
                          )}
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              {document.status === "error" && (
                                <button
                                  type="button"
                                  className="rounded-full p-2 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                                  title={t("Tentar processar novamente")}
                                  onClick={() =>
                                    handleReprocessDocument(document)
                                  }
                                  disabled={reprocessDocument.isPending}
                                >
                                  <RotateCcw
                                    className={`h-4 w-4 ${reprocessDocument.isPending ? "animate-spin" : ""}`}
                                  />
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-full p-2 hover:bg-destructive/10 hover:text-destructive"
                                title={t("Excluir fonte")}
                                onClick={() => handleDeleteDocument(document)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {!documentsLoading && !documents?.length && (
                  <div className="px-[10px] text-[14px] text-muted-foreground">
                    {t("Nenhuma fonte adicionada ainda.")}
                  </div>
                )}
              </div>
              {uploadError && (
                <p className="whitespace-pre-line px-[10px] text-[13px] text-destructive">
                  {uploadError}
                </p>
              )}
            </section>

            <section
              className="flex min-w-0 flex-col gap-3"
              aria-labelledby="knowledge-context"
            >
              <div className="flex items-center justify-between px-[10px]">
                <div>
                  <h2
                    id="knowledge-context"
                    className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {t("Contexto consolidado")}
                  </h2>
                  <p className="mt-1 text-[13px]">
                    {t(
                      "A síntese muda quando as fontes ativas mudam. Seus ajustes manuais ficam separados, têm prioridade e nunca são apagados.",
                    )}
                  </p>
                </div>
                {synthesizeBase.isPending && (
                  <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              <textarea
                className="text min-h-[360px] w-full resize-y font-mono text-[13px] leading-relaxed"
                value={generatedContext}
                readOnly
                placeholder={t(
                  "Adicione fontes ativas para gerar o contexto consolidado...",
                )}
              />

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-[14px]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-medium text-foreground">
                      {t("Ajustes manuais")}
                    </h3>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {t(
                        "Use para regras confirmadas que não estão nos arquivos. Em conflito, este texto tem prioridade; a síntese automática continua como referência.",
                      )}
                    </p>
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {instructions.length.toLocaleString("pt-BR")} /{" "}
                    {MAX_INSTRUCTIONS.toLocaleString("pt-BR")}
                  </span>
                </div>
                <textarea
                  className="text min-h-[150px] w-full resize-y font-mono text-[13px] leading-relaxed"
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
                />
                {isAdmin && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="primary"
                      loading={updateBase.isPending}
                      invalid={
                        instructions === (selectedBase.instructions || "")
                      }
                      onClick={handleSaveInstructions}
                    >
                      <Save className="h-4 w-4" />
                      {t("Salvar ajustes")}
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      loading={synthesizeBase.isPending}
                      onClick={() => void handleSynthesize()}
                    >
                      <Sparkles className="h-4 w-4" />
                      {t("Reinterpretar fontes")}
                    </Button>
                  </div>
                )}
                {feedback && (
                  <p className="mt-2 text-[13px] text-primary">{feedback}</p>
                )}
              </div>
            </section>
          </div>
        )}
      </SectionBody>
    </>
  );
}
