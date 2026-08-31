import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useState } from "react";
import { supabase } from "@/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { AppleFilled, FacebookFilled, GoogleOutlined } from "@ant-design/icons";

type OAuthProvider = "google" | "apple" | "facebook";

const oauthProviderNames: OAuthProvider[] = ["google", "apple", "facebook"];

const configuredOAuthProviders = (() => {
  const configured = import.meta.env.VITE_AUTH_PROVIDERS?.split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);

  if (!configured?.length) {
    return ["google"] as OAuthProvider[];
  }

  return oauthProviderNames.filter((provider) => configured.includes(provider));
})();

const oauthProviderConfig: Record<
  OAuthProvider,
  { icon: ComponentType; className: string }
> = {
  google: {
    icon: GoogleOutlined,
    className: "bg-blue-500 hover:bg-blue-400",
  },
  apple: {
    icon: AppleFilled,
    className: "bg-black hover:bg-gray-900",
  },
  facebook: {
    icon: FacebookFilled,
    className: "bg-[#1877F2] hover:bg-[#166FE5]",
  },
};

export const Route = createFileRoute("/login")({
  validateSearch: (search): { redirect?: string } => ({
    redirect: (search.redirect as string) || undefined,
  }),
  component: Login,
});

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(
    null,
  );
  const { redirect } = Route.useSearch();

  const { translate: t } = useTranslation();

  async function handleLogInWithOauth(provider: OAuthProvider) {
    setMessage("");
    setMessageKind("error");
    setLoadingProvider(provider);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + (redirect || "/"),
        },
      });

      if (error) {
        setMessage(
          t("Error al conectar. Intentá de nuevo o contactá al proveedor."),
        );
      }
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setMessageKind("error");
    setLoadingEmail(true);

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + (redirect || "/"),
          },
        });

        if (error) {
          setMessage(t("No pudimos crear la cuenta. Intentá de nuevo."));
          return;
        }

        setPassword("");
        if (data.session) {
          setEmail("");
        } else {
          setMessage(
            t("Cuenta creada. Revisá tu correo para confirmar el registro."),
          );
          setMessageKind("success");
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(t("¡Credenciales inválidas!"));
      } else {
        setEmail("");
        setPassword("");
      }
    } finally {
      setLoadingEmail(false);
    }
  }

  function handleAuthModeChange() {
    setAuthMode((mode) => (mode === "login" ? "signup" : "login"));
    setMessage("");
    setPassword("");
  }

  return (
    <div className="flex flex-col gap-9 justify-center items-center bg-background text-foreground h-dvh w-screen">
      <div className="text-primary tracking-tighter font-bold text-[36px]">
        Auguria
      </div>

      <div className="flex flex-col gap-3 w-[250px]">
        <form onSubmit={handleEmailSubmit} className="login-form">
          <label>
            <div className="label">{t("Correo electrónico")}</div>
            <input
              className="text"
              placeholder="seu@email.com"
              type="email"
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              value={email}
            />
          </label>

          <label>
            <div className="label">{t("Contraseña")}</div>
            <input
              className="text"
              placeholder="******"
              type="password"
              autoComplete={
                authMode === "signup" ? "new-password" : "current-password"
              }
              minLength={authMode === "signup" ? 6 : undefined}
              required
              onChange={(e) => setPassword(e.target.value)}
              value={password}
            />
          </label>

          {message && (
            <div
              className={`self-center text-md ${messageKind === "success" ? "text-green-600" : "text-destructive"}`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            className="primary w-full mt-[16px]"
            disabled={loadingEmail || loadingProvider !== null}
          >
            {loadingEmail
              ? t("Cargando...")
              : authMode === "signup"
                ? t("Crear cuenta")
                : t("Entrar")}
          </button>
        </form>

        <button
          type="button"
          className="text-primary underline text-sm"
          onClick={handleAuthModeChange}
          disabled={loadingEmail || loadingProvider !== null}
        >
          {authMode === "signup" ? t("Ya tengo una cuenta") : t("Crear cuenta")}
        </button>

        <div className="border-b border-border w-full" />

        {configuredOAuthProviders.map((provider) => {
          const Icon = oauthProviderConfig[provider].icon;
          const label =
            provider === "google"
              ? t("Continuar con Google")
              : provider === "apple"
                ? t("Continuar con Apple")
                : t("Continuar con Facebook");

          return (
            <button
              key={provider}
              type="button"
              className={`primary ${oauthProviderConfig[provider].className} text-white w-full border-none`}
              onClick={() => handleLogInWithOauth(provider)}
              disabled={loadingProvider !== null || loadingEmail}
            >
              <Icon /> {loadingProvider === provider ? t("Cargando...") : label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
