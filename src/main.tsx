import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { TickProvider } from "./contexts/useTick";
import { WhatsAppIntegrationProvider } from "./contexts/WhatsAppIntegrationContext";
import { loadTranslations } from "./i18n/translations";
import useBoundStore from "./stores/useBoundStore";
import {
  detectDefaultLanguage,
  type AccentColor,
  type Language,
  type ThemeMode,
} from "./stores/uiSlice";
import { applyAccentColor } from "./theme";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient();

// After a deploy, an open tab may still reference hashed chunks that no longer
// exist ("Failed to fetch dynamically imported module"). Vite surfaces this as
// vite:preloadError — reload once to pick up the new build. The timestamp
// guard avoids a reload loop if the fresh build also fails to load.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "chunk-reload-at";
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10_000) return; // let the error surface

  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

function detectTheme(): ThemeMode {
  try {
    const stored = JSON.parse(localStorage.getItem("app-state") || "{}") as {
      state?: { ui?: { theme?: ThemeMode } };
    };
    const theme = stored.state?.ui?.theme;
    if (theme === "light" || theme === "dark" || theme === "auto") {
      return theme;
    }
  } catch {
    /* ignore */
  }

  return "auto";
}

function detectAccentColor(): AccentColor {
  try {
    const stored = JSON.parse(localStorage.getItem("app-state") || "{}") as {
      state?: { ui?: { accentColor?: AccentColor } };
    };
    const accentColor = stored.state?.ui?.accentColor;
    if (
      accentColor === "terracotta" ||
      accentColor === "purple" ||
      accentColor === "green" ||
      accentColor === "blue" ||
      accentColor === "red"
    ) {
      return accentColor;
    }
  } catch {
    /* ignore */
  }

  return "purple";
}

function applyTheme(theme: ThemeMode, accentColor: AccentColor) {
  const isDark =
    theme === "dark" || (theme === "auto" && darkModeMediaQuery.matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  applyAccentColor(accentColor, isDark);
}

let activeTheme = detectTheme();
let activeAccentColor = detectAccentColor();
applyTheme(activeTheme, activeAccentColor);

darkModeMediaQuery.addEventListener("change", () => {
  if (activeTheme === "auto") applyTheme(activeTheme, activeAccentColor);
});

useBoundStore.subscribe((state, previousState) => {
  const themeChanged = state.ui.theme !== previousState.ui.theme;
  const accentColorChanged =
    state.ui.accentColor !== previousState.ui.accentColor;

  if (themeChanged || accentColorChanged) {
    activeTheme = state.ui.theme;
    activeAccentColor = state.ui.accentColor;
    applyTheme(activeTheme, activeAccentColor);
  }
});

// Preload translations before rendering
function detectLanguage(): Language {
  try {
    const stored = JSON.parse(localStorage.getItem("app-state") || "{}") as {
      state?: { ui?: { language?: Language } };
    };
    const language = stored.state?.ui?.language;
    if (language) return language;
  } catch {
    /* ignore */
  }

  return detectDefaultLanguage();
}

const initialLang = detectLanguage();
await loadTranslations(initialLang);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TickProvider>
        <WhatsAppIntegrationProvider>
          <RouterProvider router={router} />
        </WhatsAppIntegrationProvider>
      </TickProvider>
    </QueryClientProvider>
  </StrictMode>,
);
