import { supabase } from "@/supabase/client";
import Avatar from "./Avatar";
import useBoundStore from "@/stores/useBoundStore";
import { useTranslation } from "@/hooks/useTranslation";
import {
  LogOut,
  Settings,
  MessageSquareText,
  Unplug,
  Bot,
  BarChart3,
  Languages,
  Plus,
  NotebookTabs,
} from "lucide-react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { LinkButton } from "./LinkButton";
import { resetAuthorizedCache } from "@/utils/IdbUtils";
import { useCurrentAgent } from "@/queries/useAgents";
import { Dropdown } from "antd";
import { useOrganizations } from "@/queries/useOrganizations";
import { useEffect, useState } from "react";

export default function Menu() {
  const user = useBoundStore((state) => state.ui.user);
  // Supabase types user_metadata as Record<string, any>; this is what SSO fills.
  const userMetadata = user?.user_metadata as
    | { picture?: string; name?: string }
    | undefined;

  const { data: agent } = useCurrentAgent();

  const setActiveOrg = useBoundStore((state) => state.ui.setActiveOrg);
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  const { data: organizations } = useOrganizations();

  const {
    translate: t,
    currentLanguage,
    setCurrentLanguage,
  } = useTranslation();

  // Simpler approach - call useLocation without select first
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = location.pathname;
  const isSettingsRoute = pathname.startsWith("/settings");
  const [closingSettings, setClosingSettings] = useState(false);

  useEffect(() => {
    if (!closingSettings) return;

    if (isSettingsRoute && window.history.length > 1) {
      router.history.back();
      return;
    }

    if (isSettingsRoute) {
      void navigate({ to: "/conversations" });
    }
    setClosingSettings(false);
  }, [closingSettings, isSettingsRoute, navigate, router]);

  const handleSettingsToggle = () => {
    if (isSettingsRoute) {
      setClosingSettings(true);
      return;
    }

    void navigate({
      to: "/settings",
      hash: (prevHash) => prevHash!,
    });
  };

  return (
    <div
      className={
        "h-full w-full z-10 flex flex-col justify-between pb-[10px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
      }
    >
      {/* Upper section */}
      <div className="flex flex-col items-center">
        {/* Conversations button */}
        <LinkButton
          to="/conversations"
          title={t("Mensajes")}
          isActive={pathname.startsWith("/conversations")}
          className="mt-[10px]"
        >
          <MessageSquareText className="w-[24px] h-[24px] stroke-[2]" />
        </LinkButton>

        {/* Agents button */}
        <LinkButton
          to="/agents"
          title={t("Agentes")}
          isActive={pathname.startsWith("/agents")}
          className="mt-[10px]"
        >
          <Bot className="w-[24px] h-[24px] stroke-[2]" />
        </LinkButton>

        {/* Contacts button */}
        <LinkButton
          to="/contacts"
          title={t("Contactos")}
          isActive={pathname.startsWith("/contacts")}
          className="mt-[10px]"
        >
          <NotebookTabs className="w-[24px] h-[24px] stroke-[2]" />
        </LinkButton>

        {/* Integrations button */}
        <LinkButton
          to="/integrations"
          title={t("Integraciones")}
          isActive={pathname.startsWith("/integrations")}
          className="mt-[10px]"
        >
          <Unplug className="w-[24px] h-[24px] stroke-[2]" />
        </LinkButton>

        {/* Stats button */}
        <LinkButton
          to="/stats"
          title={t("Estadísticas")}
          isActive={pathname.startsWith("/stats")}
          className="mt-[10px]"
        >
          <BarChart3 className="w-[24px] h-[24px] stroke-[2]" />
        </LinkButton>
      </div>

      {/* Lower section */}
      <div className="flex flex-col items-center">
        {/* Settings button */}
        <button
          type="button"
          title={t("Preferencias")}
          aria-label={t("Preferencias")}
          aria-pressed={isSettingsRoute}
          onClick={handleSettingsToggle}
          className={
            "mt-[10px] p-[8px] rounded-full border-0 bg-transparent text-sidebar-foreground hover:bg-muted" +
            (isSettingsRoute ? " bg-muted" : "")
          }
        >
          <Settings className="w-[20px] h-[20px] stroke-[2]" />
        </button>

        <Dropdown
          menu={{
            items: [
              {
                key: "user_email",
                type: "group", // using group name as title style
                label: user?.email || "",
              },
              { type: "divider" },
              {
                key: "orgs",
                type: "group",
                label: t("Empresas"),
                children: [
                  ...(organizations?.map((org) => ({
                    key: org.id,
                    label: org.name,
                    onClick: () => {
                      setActiveOrg(org.id);
                      void navigate({ to: "/conversations" });
                    },
                  })) || []),
                  {
                    key: "new_org",
                    label: t("Nueva organización"),
                    icon: <Plus className="w-[16px] h-[16px]" />,
                    onClick: () =>
                      navigate({
                        to: "/settings/organization/new",
                        hash: (prevHash) => prevHash!,
                      }),
                  },
                ],
              },
              { type: "divider" },
              {
                key: "lang",
                label: t("Idioma"),
                icon: <Languages className="w-[16px] h-[16px]" />,
                children: (["es", "en", "pt", "sw", "fr"] as const).map(
                  (lang) => ({
                    key: lang,
                    label: {
                      es: "Español",
                      en: "English",
                      pt: "Português",
                      sw: "Kiswahili",
                      fr: "Français",
                    }[lang],
                    className:
                      lang === currentLanguage
                        ? "ant-dropdown-menu-item-selected"
                        : "",
                    onClick: () => setCurrentLanguage(lang),
                  }),
                ),
              },
              { type: "divider" },
              {
                key: "logout",
                label: t("Cerrar sesión"),
                icon: <LogOut className="w-[16px] h-[16px]" />,
                onClick: () => {
                  void supabase.auth.signOut();
                  resetAuthorizedCache().catch(console.error);
                },
              },
            ],
            selectable: true,
            selectedKeys: [...(activeOrgId ? [activeOrgId] : [])],
          }}
          trigger={["click"]}
        >
          <div className="cursor-pointer mt-[10px] p-[2px] rounded-full hover:bg-muted">
            <Avatar
              src={agent?.picture || userMetadata?.picture}
              fallback={(
                agent?.name ||
                userMetadata?.name ||
                user?.email ||
                "?"
              ).charAt(0)}
              size={32}
              className="bg-primary text-primary-foreground text-[14px] border border-sidebar-border"
            />
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
