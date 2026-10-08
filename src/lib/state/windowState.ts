import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { miniPlayerState } from "./miniPlayer.svelte";

/**
 * Remembers the main window's size, position and maximised state between
 * launches. Done here rather than with the window-state plugin because that
 * would save the mini player's size when the app is closed in mini mode.
 */

const KEY = "audia-window";
// Windows reports roughly -32000,-32000 for a minimised window
const MINIMISED_COORD = -30000;

interface SavedWindow {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

const inTauri = "__TAURI_INTERNALS__" in window;

function read(): SavedWindow | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    const ok = saved && ["x", "y", "width", "height"].every((k) => Number.isFinite(saved[k]));
    return ok ? saved : null;
  } catch {
    return null;
  }
}

function write(saved: SavedWindow) {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Won't be remembered
  }
}

/** Is enough of the title-bar area on a connected monitor to grab the window? */
async function isReachable(x: number, y: number, width: number): Promise<boolean> {
  const monitors = await availableMonitors();
  const points = [
    [x + 40, y + 20],
    [x + width / 2, y + 20],
  ];
  return points.some(([px, py]) =>
    monitors.some(
      (m) => px >= m.position.x && py >= m.position.y && px < m.position.x + m.size.width && py < m.position.y + m.size.height,
    ),
  );
}

/** Restore the saved bounds, then show the window (it starts hidden to avoid a visible jump). */
export async function restoreWindowState(): Promise<void> {
  if (!inTauri) return;
  const win = getCurrentWindow();
  try {
    const saved = read();
    if (saved && saved.width >= 400 && saved.height >= 300 && (await isReachable(saved.x, saved.y, saved.width))) {
      await win.setSize(new PhysicalSize(saved.width, saved.height));
      await win.setPosition(new PhysicalPosition(saved.x, saved.y));
      if (saved.maximized) await win.maximize();
    }
  } catch (e) {
    console.warn("Couldn't restore window position:", e);
  } finally {
    await win.show();
    await win.setFocus();
  }
}

/** Save the current bounds (or, in mini player mode, the full window's bounds). */
export async function saveWindowState(): Promise<void> {
  if (!inTauri) return;
  const win = getCurrentWindow();
  const previous = read();

  if (miniPlayerState.active) {
    const full = miniPlayerState.fullBounds;
    if (full) {
      write({ x: full.position.x, y: full.position.y, width: full.size.width, height: full.size.height, maximized: full.maximized });
    }
    return;
  }
  if (await win.isMinimized()) return;

  const maximized = await win.isMaximized();
  if (maximized) {
    // While maximised the window's bounds are the screen's; keep the last normal ones
    if (previous) write({ ...previous, maximized: true });
    return;
  }
  const pos = await win.outerPosition();
  const size = await win.outerSize();
  if (pos.x <= MINIMISED_COORD || pos.y <= MINIMISED_COORD) return;
  write({ x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: false });
}

/** Keep the saved bounds current as the window moves and resizes (in case the app doesn't exit cleanly). */
export async function trackWindowState(): Promise<() => void> {
  if (!inTauri) return () => {};
  const win = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (miniPlayerState.active) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => saveWindowState().catch(() => {}), 500);
  };
  const unlisten = await Promise.all([win.onMoved(schedule), win.onResized(schedule)]);
  return () => {
    if (timer) clearTimeout(timer);
    unlisten.forEach((fn) => fn());
  };
}
