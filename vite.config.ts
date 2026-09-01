import { defineConfig, loadEnv } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const REQUIRED_PUBLIC_ENV = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
] as const;

function validatePublicEnv(mode: string) {
  const env = {
    ...loadEnv(mode, process.cwd(), "VITE_"),
    ...process.env,
  };
  const missing = REQUIRED_PUBLIC_ENV.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Build interrompido: configure ${missing.join(", ")} no ambiente do Vite antes de publicar a UI.`,
    );
  }

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(env.VITE_SUPABASE_URL);
  } catch {
    throw new Error(
      "Build interrompido: VITE_SUPABASE_URL precisa ser uma URL http(s) válida.",
    );
  }

  if (supabaseUrl.protocol !== "http:" && supabaseUrl.protocol !== "https:") {
    throw new Error(
      "Build interrompido: VITE_SUPABASE_URL precisa usar o protocolo http ou https.",
    );
  }

  if (
    mode === "production" &&
    (supabaseUrl.hostname === "localhost" ||
      supabaseUrl.hostname === "127.0.0.1" ||
      supabaseUrl.hostname === "::1" ||
      supabaseUrl.hostname === "[::1]")
  ) {
    throw new Error(
      "Build interrompido: a UI de produção não pode apontar para um Supabase local.",
    );
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  validatePublicEnv(mode);

  return {
    plugins: [
      // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      tailwindcss(),
    ],
    build: {
      chunkSizeWarningLimit: 600,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
