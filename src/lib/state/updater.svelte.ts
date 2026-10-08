import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { uiState } from "./ui.svelte";
import { logError } from "../utils/log";

/**
 * Updates from GitHub Releases. The app checks shortly after starting (unless
 * turned off in Settings) and offers the update in a notification; Settings can
 * also check on demand. Installing quits the app, runs the installer and restarts.
 */

type Status = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "installing" | "error";

const AUTO_CHECK_KEY = "audia-auto-update-check";
const inTauri = "__TAURI_INTERNALS__" in window;

function readAutoCheck(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== "0";
  } catch {
    return true;
  }
}

function createUpdaterState() {
  let status = $state<Status>("idle");
  let currentVersion = $state("");
  let available = $state<{ version: string; notes: string } | null>(null);
  let progress = $state<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });
  let error = $state("");
  let autoCheck = $state(readAutoCheck());
  let update: Update | null = null;

  if (inTauri) getVersion().then((v) => (currentVersion = v)).catch(() => {});

  async function checkForUpdates(options: { silent?: boolean } = {}): Promise<void> {
    if (!inTauri || status === "checking" || status === "downloading" || status === "installing") return;
    status = "checking";
    error = "";
    try {
      update = await check();
      if (update) {
        available = { version: update.version, notes: update.body ?? "" };
        status = "available";
        if (options.silent) {
          uiState.showToast(`Audia ${update.version} is available.`, {
            durationMs: 15000,
            action: { label: "Update", run: () => installUpdate() },
          });
        }
      } else {
        available = null;
        status = "up-to-date";
      }
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
      logError("Update check failed", e);
      if (!options.silent) uiState.showToast(`Couldn't check for updates: ${error}`, { kind: "error" });
    }
  }

  async function installUpdate(): Promise<void> {
    if (!update || status === "downloading" || status === "installing") return;
    status = "downloading";
    progress = { downloaded: 0, total: null };
    try {
      // Save the listening position first: on Windows the installer closes the app
      const { playerState } = await import("./player.svelte");
      await playerState.saveProgress().catch(() => {});

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") progress = { downloaded: 0, total: event.data.contentLength ?? null };
        else if (event.event === "Progress") progress = { ...progress, downloaded: progress.downloaded + event.data.chunkLength };
        else if (event.event === "Finished") status = "installing";
      });
      await relaunch();
    } catch (e) {
      status = "error";
      error = e instanceof Error ? e.message : String(e);
      logError("Update install failed", e);
      uiState.showToast(`The update couldn't be installed: ${error}`, { kind: "error" });
    }
  }

  return {
    get status() {
      return status;
    },
    get currentVersion() {
      return currentVersion;
    },
    get available() {
      return available;
    },
    get progress() {
      return progress;
    },
    get error() {
      return error;
    },
    /** Check for updates automatically shortly after the app starts. */
    get autoCheck() {
      return autoCheck;
    },
    set autoCheck(v: boolean) {
      autoCheck = v;
      try {
        localStorage.setItem(AUTO_CHECK_KEY, v ? "1" : "0");
      } catch {
        // Not remembered then
      }
    },
    checkForUpdates,
    installUpdate,
  };
}

export const updaterState = createUpdaterState();
