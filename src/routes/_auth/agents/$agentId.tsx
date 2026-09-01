import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useAgent,
  useDeleteAgent,
  useUpdateAgent,
  useCurrentAgent,
} from "@/queries/useAgents";
import {
  useAgentKnowledgeBaseIds,
  useKnowledgeBases,
  useUpdateAgentKnowledgeBases,
} from "@/queries/useKnowledge";
import { useForm, useWatch } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import useBoundStore from "@/stores/useBoundStore";
import { type AIAgentRow, type AIAgentUpdate } from "@/supabase/client";
import { openLocalDirect } from "@/utils/ConversationUtils";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import SectionFooter from "@/components/SectionFooter";
import {
  protocols,
  protocolLabels,
  defaultModels,
  creditModels,
  apiKeyInstructions,
} from "./new";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import SectionField from "@/components/SectionField";
import ToolsSection from "@/components/ToolsSection";

export const Route = createFileRoute("/_auth/agents/$agentId")({
  component: AgentDetail,
});

function AgentDetail() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { agentId } = Route.useParams();
  const { data: agent } = useAgent<AIAgentRow>(agentId);
  const { data: currentAgent } = useCurrentAgent();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const { data: knowledgeBases, isLoading: knowledgeBasesLoading } =
    useKnowledgeBases();
  const { data: linkedKnowledgeBaseIds, isLoading: knowledgeLinksLoading } =
    useAgentKnowledgeBaseIds(agentId);
  const updateKnowledgeBases = useUpdateAgentKnowledgeBases(agentId);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const [provider, setProvider] = useState<keyof typeof protocols>("openai");
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<
    string[]
  >([]);

  const localAddress = useOrganizationsAddresses().data?.find(
    (address) => address.service === "local",
  );

  useEffect(() => {
    if (!agent) return;
    const apiUrl = agent.extra?.api_url || "";
    const isKnown = ["openai", "anthropic", "groq", "google"].includes(apiUrl);
    setProvider(isKnown ? apiUrl : "custom");
  }, [agent]);

  useEffect(() => {
    if (linkedKnowledgeBaseIds) {
      setSelectedKnowledgeBaseIds(linkedKnowledgeBaseIds);
    }
  }, [linkedKnowledgeBaseIds]);

  // Normalize agent data to ensure tools is always an array
  const normalizedAgent = useMemo(() => {
    if (!agent) return undefined;
    return {
      ...agent,
      extra: {
        ...agent.extra,
        tools: agent.extra?.tools ?? [],
      },
    };
  }, [agent]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty, isValid },
  } = useForm<AIAgentUpdate>({ values: normalizedAgent });

  const model = useWatch({ control, name: "extra.model" });
  const knowledgeBasesDirty = useMemo(() => {
    if (!linkedKnowledgeBaseIds) return false;
    return (
      [...linkedKnowledgeBaseIds].sort().join(",") !==
      [...selectedKnowledgeBaseIds].sort().join(",")
    );
  }, [linkedKnowledgeBaseIds, selectedKnowledgeBaseIds]);
  const handleChat = async () => {
    if (!activeOrgId || !localAddress || !currentAgent) return;

    // A local DM with the AI agent: a direct is DEFINED by its roster, so the
    // address IS the participant list — no per-conversation agent override
    // exists any more. Which also means there is only ever ONE of these, so
    // this opens the room rather than starting a new one.
    const convId = await openLocalDirect({
      organization_id: activeOrgId,
      organization_address: localAddress.address,
      roster: [currentAgent.id, agentId],
      name: agent?.name,
    });

    void navigate({ hash: convId });
  };

  return (
    agent && (
      <>
        <SectionHeader
          title={agent.name}
          onDelete={() => {
            deleteAgent.mutate(agentId, {
              onSuccess: () =>
                navigate({ to: "..", hash: (prevHash) => prevHash! }),
            });
          }}
          deleteDisabled={!isAdmin}
          deleteDisabledReason={t("Requiere permisos de administrador")}
          deleteLoading={deleteAgent.isPending}
        />

        <SectionBody>
          <form
            id="agent-form"
            onSubmit={handleSubmit((data) => updateAgent.mutate(data))}
          >
            {/* Root view fields */}
            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                type="text"
                className="text"
                placeholder={t("Nombre del agente")}
                {...register("name", { required: true })}
              />
            </label>

            <SelectField
              name="extra.mode"
              control={control}
              label={t("Estado")}
              options={[
                { value: "active", label: t("Activo") },
                { value: "inactive", label: t("Inactivo") },
              ]}
            />

            <div className="border-t border-border" />

            <TextAreaField
              name="extra.instructions"
              control={control}
              label={t("Instrucciones")}
              placeholder={t("Eres un asistente útil...")}
            />

            <SectionField
              label={t("Bases de conhecimento")}
              description={
                selectedKnowledgeBaseIds.length
                  ? t("Bases selecionadas")
                  : t("Nenhuma base vinculada")
              }
              disabled={!isAdmin}
            >
              <p className="text-[14px] text-muted-foreground">
                {t(
                  "Vincule explicitamente as bases que este agente pode consultar. Isso permite testar uma nova versão isoladamente antes de colocá-la em produção.",
                )}
              </p>
              {knowledgeBasesLoading || knowledgeLinksLoading ? (
                <p className="text-[14px] text-muted-foreground">
                  {t("Carregando bases...")}
                </p>
              ) : knowledgeBases?.length ? (
                <div className="flex flex-col gap-3">
                  {knowledgeBases.map((base) => (
                    <label
                      key={base.id}
                      className="flex items-start gap-3 rounded-lg border border-border p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedKnowledgeBaseIds.includes(base.id)}
                        onChange={(event) => {
                          setSelectedKnowledgeBaseIds((current) =>
                            event.target.checked
                              ? [...current, base.id]
                              : current.filter((id) => id !== base.id),
                          );
                        }}
                        disabled={!isAdmin}
                      />
                      <span className="flex flex-col gap-1">
                        <span>{base.name}</span>
                        {base.description && (
                          <span className="text-[13px] text-muted-foreground">
                            {base.description}
                          </span>
                        )}
                        {base.status === "archived" && (
                          <span className="text-[12px] text-muted-foreground">
                            {t("Arquivada — não será consultada")}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-muted-foreground">
                  {t("Crie uma base de conhecimento para vinculá-la aqui.")}
                </p>
              )}
              <Button
                type="button"
                className="primary"
                loading={updateKnowledgeBases.isPending}
                invalid={!knowledgeBasesDirty}
                onClick={() =>
                  updateKnowledgeBases.mutate(selectedKnowledgeBaseIds)
                }
              >
                {t("Salvar bases do agente")}
              </Button>
            </SectionField>

            {/* Tools Section */}
            <ToolsSection
              control={control}
              register={register}
              setValue={setValue}
            />

            {/* AI Section */}
            <SectionField
              label={t("Modelo de IA")}
              description={model || t("Ninguno")}
            >
              <SelectField
                value={provider}
                modalClassName="bottom-0"
                onChange={(val) => {
                  setProvider(val);
                  setValue("extra.model", defaultModels[val] || "");

                  const availableProtocols =
                    protocols[val as keyof typeof protocols];
                  setValue("extra.protocol", availableProtocols[0]);

                  if (val !== "custom") {
                    setValue("extra.api_url", val, { shouldDirty: true });
                  } else {
                    setValue("extra.api_url", "", { shouldDirty: true });
                  }
                }}
                label={t("Proveedor")}
                options={[
                  { value: "openai", label: "OpenAI" },
                  { value: "anthropic", label: "Anthropic" },
                  { value: "groq", label: "Groq" },
                  { value: "google", label: "Google" },
                  { value: "custom", label: t("Personalizado") },
                ]}
              />

              <SelectField
                name="extra.protocol"
                control={control}
                modalClassName="bottom-0"
                label={t("Protocolo")}
                options={(
                  protocols[provider as keyof typeof protocols] || []
                ).map((p) => ({
                  value: p,
                  label: protocolLabels[p] || p,
                }))}
              />

              {provider === "custom" && (
                <label>
                  <div className="label">{t("API URL")}</div>
                  <input
                    type="text"
                    className="text"
                    placeholder="https://api.example.com/v1"
                    {...register("extra.api_url")}
                  />
                </label>
              )}

              <label>
                <div className="label">{t("Clave API")}</div>
                <input
                  type="text"
                  className="text"
                  placeholder={t("Clave API del proveedor")}
                  {...register("extra.api_key")}
                />
              </label>

              {provider !== "custom" && apiKeyInstructions[provider] && (
                <div className="instructions">
                  <p>
                    {t(
                      "Usar una clave API propia no consume créditos locales y permite usar cualquier modelo.",
                    )}
                  </p>
                  <p>
                    <strong>
                      {apiKeyInstructions[provider].free
                        ? t("Obtené una clave gratuita:")
                        : t("Obtené una clave:")}
                    </strong>{" "}
                    <a
                      href={apiKeyInstructions[provider].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {apiKeyInstructions[provider].label}
                    </a>
                    {" > "}
                    {apiKeyInstructions[provider].steps}
                  </p>
                </div>
              )}

              <label>
                <div className="label">{t("Modelo")}</div>
                <input
                  type="text"
                  className="text"
                  placeholder={t("Nombre del modelo")}
                  {...register("extra.model")}
                />
              </label>

              {provider !== "custom" && creditModels[provider] && (
                <div className="instructions">
                  <p>
                    {t("Los siguientes modelos funcionan con créditos de IA:")}
                  </p>
                  <ul>
                    {creditModels[provider].map((m) => (
                      <li key={m}>
                        <code>{m}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label>
                <div className="label">
                  {t("Demora de respuesta (segundos)")}
                </div>
                <input
                  type="number"
                  className="text"
                  min={0}
                  placeholder="3"
                  {...register("extra.response_delay_seconds", {
                    valueAsNumber: true,
                  })}
                />
              </label>

              <TextAreaField
                control={control}
                name="extra.welcome_message"
                label={t("Mensaje de bienvenida")}
                placeholder={t(
                  "Hola! Soy un agente virtual. ¿En qué puedo ayudarte?",
                )}
              />

              <label>
                <div className="label">{t("Mensajes máximos")}</div>
                <input
                  type="number"
                  className="text"
                  min={1}
                  placeholder="50"
                  {...register("extra.max_messages", { valueAsNumber: true })}
                />
              </label>

              <label>
                <div className="label">{t("Temperatura")}</div>
                <input
                  type="number"
                  className="text"
                  min={0}
                  max={2}
                  step={0.1}
                  placeholder="1.0"
                  {...register("extra.temperature", { valueAsNumber: true })}
                />
              </label>

              {provider === "custom" && (
                <div className="instructions">
                  <p>
                    {t(
                      "Se envían los siguientes encabezados HTTP con cada solicitud:",
                    )}
                  </p>
                  <ul>
                    <li>
                      <code>organization-id</code>
                    </li>
                    <li>
                      <code>organization-address</code>
                    </li>
                    <li>
                      <code>conversation-id</code>
                    </li>
                    <li>
                      <code>agent-id</code>
                    </li>
                    <li>
                      <code>contact-id</code>
                    </li>
                    <li>
                      <code>contact-address</code>
                    </li>
                  </ul>
                </div>
              )}
            </SectionField>
          </form>
        </SectionBody>

        <SectionFooter>
          {!isDirty ? (
            <button
              type="button"
              className="primary"
              onClick={() => void handleChat()}
            >
              {t("Chatea con este agente")}
            </button>
          ) : (
            <Button
              form="agent-form"
              type="submit"
              disabled={!isAdmin}
              invalid={!isValid}
              loading={updateAgent.isPending}
              disabledReason={t("Requiere permisos de administrador")}
              className="primary"
            >
              {t("Actualizar")}
            </Button>
          )}
        </SectionFooter>
      </>
    )
  );
}
