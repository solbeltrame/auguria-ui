import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import SectionItem from "@/components/SectionItem";
import { useTranslation } from "@/hooks/useTranslation";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import useBoundStore from "@/stores/useBoundStore";
import type { AccentColor, ThemeMode } from "@/stores/uiSlice";
import { ACCENT_PALETTES } from "@/theme";
import {
  Building2,
  Users,
  Webhook,
  Key,
  Sun,
  Moon,
  Monitor,
  Palette,
} from "lucide-react";

export const Route = createFileRoute("/_auth/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const theme = useBoundStore((state) => state.ui.theme);
  const setTheme = useBoundStore((state) => state.ui.setTheme);
  const accentColor = useBoundStore((state) => state.ui.accentColor);
  const setAccentColor = useBoundStore((state) => state.ui.setAccentColor);

  const themeIcon =
    theme === "light" ? (
      <Sun className="w-[24px] h-[24px] text-muted-foreground" />
    ) : theme === "dark" ? (
      <Moon className="w-[24px] h-[24px] text-muted-foreground" />
    ) : (
      <Monitor className="w-[24px] h-[24px] text-muted-foreground" />
    );

  const accentOptions: { value: AccentColor; label: string }[] = [
    { value: "terracotta", label: t("Terracota") },
    { value: "purple", label: t("Roxo") },
    { value: "green", label: t("Verde") },
    { value: "blue", label: t("Azul") },
    { value: "red", label: t("Vermelho") },
  ];

  return (
    <>
      <SectionHeader title={t("Preferencias")} />

      <SectionBody className="gap-6">
        <section
          className="flex flex-col gap-[2px]"
          aria-labelledby="user-settings"
        >
          <h2
            id="user-settings"
            className="px-[10px] text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t("Usuario")}
          </h2>
          <SectionItem
            title={t("Tema")}
            description={t("Tema de la interfaz")}
            aside={<div className="p-[8px]">{themeIcon}</div>}
            trailing={
              <select
                aria-label={t("Tema")}
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemeMode)}
                className="!w-auto min-w-[112px] rounded-lg border border-border bg-background px-[8px] py-[4px] text-[14px] text-foreground"
              >
                <option value="light">{t("Claro")}</option>
                <option value="dark">{t("Oscuro")}</option>
                <option value="auto">{t("Automático")}</option>
              </select>
            }
          />
          <SectionItem
            title={t("Cor de destaque")}
            description={t("Cor dos botões e destaques")}
            aside={
              <div className="p-[8px]">
                <Palette className="w-[24px] h-[24px] text-muted-foreground" />
              </div>
            }
            trailing={
              <div
                className="flex shrink-0 gap-[4px]"
                role="radiogroup"
                aria-label={t("Cor de destaque")}
              >
                {accentOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={accentColor === value}
                    aria-label={label}
                    title={label}
                    onClick={() => setAccentColor(value)}
                    className={
                      "w-[22px] h-[22px] rounded-full border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
                      (accentColor === value
                        ? "border-foreground"
                        : "border-transparent hover:border-muted-foreground")
                    }
                    style={{
                      backgroundColor: ACCENT_PALETTES[value].swatch,
                    }}
                  />
                ))}
              </div>
            }
          />
        </section>

        <section
          className="flex flex-col gap-[2px]"
          aria-labelledby="company-settings"
        >
          <h2
            id="company-settings"
            className="px-[10px] text-[12px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {t("Empresas")}
          </h2>
          <SectionItem
            title={t("Organización")}
            aside={
              <div className="p-[8px]">
                <Building2 className="w-[24px] h-[24px] text-muted-foreground" />
              </div>
            }
            onClick={() =>
              navigate({
                to: "/settings/organization",
                hash: (prevHash) => prevHash!,
              })
            }
          />
          <SectionItem
            title={t("Miembros")}
            aside={
              <div className="p-[8px]">
                <Users className="w-[24px] h-[24px] text-muted-foreground" />
              </div>
            }
            onClick={() =>
              navigate({
                to: "/settings/members",
                hash: (prevHash) => prevHash!,
              })
            }
          />
          <SectionItem
            title={t("Webhooks")}
            aside={
              <div className="p-[8px]">
                <Webhook className="w-[24px] h-[24px] text-muted-foreground" />
              </div>
            }
            onClick={() =>
              navigate({
                to: "/settings/webhooks",
                hash: (prevHash) => prevHash!,
              })
            }
          />
          <SectionItem
            title={t("Claves API")}
            aside={
              <div className="p-[8px]">
                <Key className="w-[24px] h-[24px] text-muted-foreground" />
              </div>
            }
            onClick={() =>
              navigate({
                to: "/settings/api-keys",
                hash: (prevHash) => prevHash!,
              })
            }
          />
        </section>
      </SectionBody>
    </>
  );
}
