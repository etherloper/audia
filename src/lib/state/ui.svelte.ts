import type { ViewName, ThemeMode } from "../types";
import { ACCENTS, DEFAULT_ACCENT, isAccentId, type AccentId } from "../utils/accents";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  durationMs: number;
  /** Changes for every toast, so its countdown restarts even if the text repeats */
  id: number;
}

interface NavEntry {
  view: ViewName;
  bookId: number | null;
}

function createUIState() {
  let theme = $state<ThemeMode>(
    (localStorage.getItem("audia-theme") as ThemeMode) || "dark",
  );
  let accent = $state<AccentId>(
    (() => {
      const stored = localStorage.getItem("audia-accent");
      return isAccentId(stored) ? stored : DEFAULT_ACCENT;
    })(),
  );
  let currentView = $state<ViewName>("home");
  let selectedBookId = $state<number | null>(null);
  let sidebarCollapsed = $state<boolean>(
    localStorage.getItem("audia-sidebar-collapsed") === "true",
  );

  let toast = $state<Toast | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let toastCount = 0;

  let navHistory: NavEntry[] = [];
  let navForward: NavEntry[] = [];
  let navigating = false;

  function pushNav() {
    if (navigating) return;
    navHistory.push({ view: currentView, bookId: selectedBookId });
    navForward = [];
  }

  function applyAccent(id: AccentId) {
    const preset = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
    const root = document.documentElement;
    if (preset.id === DEFAULT_ACCENT) {
      // Theme-adaptive default (brown in light, white in dark) lives in the
      // stylesheet — clear the inline overrides so it can take effect.
      for (const shade of [300, 400, 500, 600]) {
        root.style.removeProperty(`--color-accent-${shade}`);
      }
      root.style.removeProperty("--color-accent-fg");
    } else {
      for (const [shade, value] of Object.entries(preset.shades)) {
        root.style.setProperty(`--color-accent-${shade}`, value);
      }
      root.style.setProperty("--color-accent-fg", preset.fg);
    }
  }

  function applyTheme(mode: ThemeMode) {
    const isDark =
      mode === "dark" ||
      (mode === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  // Listen for OS theme changes when in system mode
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (theme === "system") applyTheme("system");
    });

  return {
    get theme() {
      return theme;
    },
    set theme(v: ThemeMode) {
      theme = v;
      localStorage.setItem("audia-theme", v);
      applyTheme(v);
    },
    get accent() {
      return accent;
    },
    set accent(v: AccentId) {
      accent = v;
      localStorage.setItem("audia-accent", v);
      applyAccent(v);
    },
    get currentView() {
      return currentView;
    },
    set currentView(v: ViewName) {
      currentView = v;
    },
    get selectedBookId() {
      return selectedBookId;
    },
    set selectedBookId(v: number | null) {
      selectedBookId = v;
    },
    get sidebarCollapsed() {
      return sidebarCollapsed;
    },
    set sidebarCollapsed(v: boolean) {
      sidebarCollapsed = v;
      localStorage.setItem("audia-sidebar-collapsed", String(v));
    },

    get toast() {
      return toast;
    },
    showToast(message: string, options: { durationMs?: number; action?: ToastAction; kind?: ToastKind } = {}) {
      const durationMs = options.durationMs ?? (options.action ? 10000 : 5000);
      toast = { message, kind: options.kind ?? "info", action: options.action, durationMs, id: ++toastCount };
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast = null;
        toastTimer = null;
      }, durationMs);
    },
    dismissToast() {
      toast = null;
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = null;
    },

    navigateToBook(bookId: number) {
      pushNav();
      selectedBookId = bookId;
      currentView = "book";
    },
    navigateToHome() {
      pushNav();
      currentView = "home";
      selectedBookId = null;
    },
    navigateToLibrary() {
      pushNav();
      currentView = "library";
      selectedBookId = null;
    },
    navigateToSettings() {
      pushNav();
      currentView = "settings";
    },
    navigateToStats() {
      pushNav();
      currentView = "stats";
    },
    goBack() {
      const entry = navHistory.pop();
      if (!entry) return;
      navForward.push({ view: currentView, bookId: selectedBookId });
      navigating = true;
      currentView = entry.view;
      selectedBookId = entry.bookId;
      navigating = false;
    },
    goForward() {
      const entry = navForward.pop();
      if (!entry) return;
      navHistory.push({ view: currentView, bookId: selectedBookId });
      navigating = true;
      currentView = entry.view;
      selectedBookId = entry.bookId;
      navigating = false;
    },
    get canGoBack() {
      return navHistory.length > 0;
    },
    get canGoForward() {
      return navForward.length > 0;
    },
    toggleSidebar() {
      this.sidebarCollapsed = !sidebarCollapsed;
    },
    toggleTheme() {
      const modes: ThemeMode[] = ["light", "dark", "system"];
      const idx = modes.indexOf(theme);
      this.theme = modes[(idx + 1) % modes.length];
    },
    initTheme() {
      applyTheme(theme);
      applyAccent(accent);
    },
  };
}

export const uiState = createUIState();
