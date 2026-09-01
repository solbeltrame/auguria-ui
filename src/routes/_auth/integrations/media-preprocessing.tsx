import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import SectionFooter from "@/components/SectionFooter";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useCurrentOrganization,
  useUpdateCurrentOrganization,
} from "@/queries/useOrganizations";
import { useCurrentAgent } from "@/queries/useAgents";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import Switch from "@/components/Switch";
import { type OrganizationUpdate } from "@/supabase/client";
import { useForm, Controller } from "react-hook-form";
import { useEffect, useMemo } from "react";

export const Route = createFileRoute("/_auth/integrations/media-preprocessing")(
  {
    component: MediaPreprocessingSettings,
  },
);

function MediaPreprocessingSettings() {
  const { translate: t } = useTranslation();
  const { data: org } = useCurrentOrganization();
  const { data: agent } = useCurrentAgent();
  const updateOrg = useUpdateCurrentOrganization();

  const isAdmin = ["admin", "owner"].includes(agent?.role || "");

  const normalizedOrg = useMemo(() => {
    if (!org) return undefined;
    return {
      ...org,
      extra: {
        ...org.extra,
        media_preprocessing: {
          mode: "inactive" as "active" | "inactive",
          provider: "google" as "google" | "groq",
          model: "gemini-2.5-flash" as
            | "gemini-2.5-pro"
            | "gemini-2.5-flash"
            | "qwen/qwen3.6-27b"
            | "qwen/qwen3.8-27b",
          transcription_model: "whisper-large-v3-turbo" as
            | "whisper-large-v3-turbo"
            | "whisper-large-v3",
          ...org.extra?.media_preprocessing,
        },
      },
    };
  }, [org]);

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    watch,
    formState: { isValid, isDirty },
  } = useForm<OrganizationUpdate>({ values: normalizedOrg });

  const selectedModel = watch("extra.media_preprocessing.model");
  const provider =
    watch("extra.media_preprocessing.provider") ||
    (selectedModel?.startsWith("qwen/") ? "groq" : "google");
  const isGroq = provider === "groq";

  useEffect(() => {
    const currentModel = getValues("extra.media_preprocessing.model");
    const modelBelongsToProvider = isGroq
      ? currentModel?.startsWith("qwen/")
      : currentModel?.startsWith("gemini-");
    if (!modelBelongsToProvider) {
      setValue(
        "extra.media_preprocessing.model",
        isGroq ? "qwen/qwen3.6-27b" : "gemini-2.5-flash",
        { shouldDirty: true, shouldValidate: true },
      );
    }
  }, [getValues, isGroq, setValue]);
  const modelOptions = isGroq
    ? [
        { value: "qwen/qwen3.6-27b", label: "Qwen 3.6 27B (visão + OCR)" },
        { value: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B (visão + OCR)" },
      ]
    : [
        { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
        { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      ];

  return (
    <>
      <SectionHeader title={t("Pre-procesamiento de media")} />

      <SectionBody>
        <form
          id="media-preprocessing-form"
          onSubmit={handleSubmit((data) => updateOrg.mutate(data))}
        >
          <Controller
            control={control}
            name="extra.media_preprocessing.mode"
            render={({ field }) => (
              <label className="flex items-center gap-[12px] cursor-pointer justify-between">
                <div className="flex flex-col gap-[2px]">
                  <div className="text-foreground">{t("Estado")}</div>
                </div>
                <Switch
                  checked={field.value === "active"}
                  onCheckedChange={(checked) =>
                    field.onChange(checked ? "active" : "inactive")
                  }
                  disabled={!isAdmin}
                  className="mt-[4px]"
                />
              </label>
            )}
          />

          <SelectField
            control={control}
            name="extra.media_preprocessing.provider"
            label={t("Provedor")}
            options={[
              { value: "google", label: "Google Gemini" },
              { value: "groq", label: "Groq (Qwen + Whisper)" },
            ]}
            disabled={!isAdmin}
          />

          <SelectField
            control={control}
            name="extra.media_preprocessing.model"
            label={t("Modelo")}
            options={modelOptions}
            disabled={!isAdmin}
          />

          {isGroq && (
            <SelectField
              control={control}
              name="extra.media_preprocessing.transcription_model"
              label={t("Modelo de transcrição")}
              options={[
                {
                  value: "whisper-large-v3-turbo",
                  label: "Whisper Large V3 Turbo (recomendado)",
                },
                { value: "whisper-large-v3", label: "Whisper Large V3" },
              ]}
              disabled={!isAdmin}
            />
          )}

          <label>
            <div className="label">
              {isGroq ? t("Chave API do Groq") : t("Chave API do Google")}
            </div>
            <input
              type="password"
              className="text"
              placeholder={isGroq ? "gsk_..." : "AIza..."}
              disabled={!isAdmin}
              {...register("extra.media_preprocessing.api_key")}
            />
          </label>

          <div className="instructions">
            <p>
              <strong>{t("Obtenha uma chave gratuita:")}</strong>{" "}
              <a
                href={
                  isGroq
                    ? "https://console.groq.com/keys"
                    : "https://aistudio.google.com/app/apikey"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {isGroq ? "console.groq.com" : "aistudio.google.com"}
              </a>
              {isGroq
                ? " > API Keys > Create API key"
                : " > Get API key > Create API key"}
            </p>
            {isGroq && (
              <p>
                {t(
                  "O Qwen interpreta imagens e páginas de PDF renderizadas; o Whisper transcreve áudios. Vídeos continuam usando Gemini.",
                )}
              </p>
            )}
          </div>

          <label>
            <div className="label">{t("Idioma")}</div>
            <input
              type="text"
              className="text"
              placeholder="Español"
              disabled={!isAdmin}
              {...register("extra.media_preprocessing.language")}
            />
          </label>

          <TextAreaField
            control={control}
            name="extra.media_preprocessing.extra_prompt"
            label={t("Instrucciones adicionales")}
            placeholder={t("Instrucciones adicionales para el modelo...")}
            disabled={!isAdmin}
          />
        </form>
      </SectionBody>

      <SectionFooter>
        <Button
          form="media-preprocessing-form"
          type="submit"
          disabled={!isAdmin}
          invalid={!isValid || !isDirty}
          loading={updateOrg.isPending}
          disabledReason={t("Requiere permisos de administrador")}
          className="primary"
        >
          {t("Actualizar")}
        </Button>
      </SectionFooter>
    </>
  );
}
