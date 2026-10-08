import { invoke } from "@tauri-apps/api/core";

/** Frontend logging: goes to the console and, in the app, to the same log file as Rust. */

type Level = "info" | "warn" | "error";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  return typeof err === "string" ? err : JSON.stringify(err);
}

function write(level: Level, message: string, err?: unknown) {
  const text = err === undefined ? message : `${message}: ${describe(err)}`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(text);
  if (inTauri) invoke("log_from_frontend", { level, message: text }).catch(() => {});
}

export const logInfo = (message: string) => write("info", message);
export const logWarn = (message: string, err?: unknown) => write("warn", message, err);
export const logError = (message: string, err?: unknown) => write("error", message, err);

/** Record uncaught errors and unhandled promise rejections. */
export function installGlobalErrorLogging() {
  window.addEventListener("error", (e) => logError("Uncaught error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => logError("Unhandled promise rejection", e.reason));
}
