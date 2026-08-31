import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import SectionItem from "@/components/SectionItem";
import { useTranslation } from "@/hooks/useTranslation";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import useBoundStore from "@/stores/useBoundStore";
import type { ThemeMode } from "@/stores/uiSlice";
import {
  Building2,
  Users,
  Webhook,
  Key,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

export const Route = createFileRoute("/_auth/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const theme = useBoundStore((state) => state.ui.theme);
  const setTheme = useBoundStore((state) => state.ui.setTheme);

  const themeIcon =
    theme === "light" ? (
      <Sun className="w-[24px] h-[24px] text-muted-foreground" />
    ) : theme === "dark" ? (
      <Moon className="w-[24px] h-[24px] text-muted-foreground" />
    ) : (
      <Monitor className="w-[24px] h-[24px] text-muted-foreground" />
    );

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
