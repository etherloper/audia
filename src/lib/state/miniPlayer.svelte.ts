import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  monitorFromPoint,
  PhysicalPosition,
  PhysicalSize,
  type Monitor,
} from "@tauri-apps/api/window";
import { settingsState } from "./settings.svelte";

/**
 * Mini player mode: the main window shrinks into a small always-on-top bar and
 * expands back to exactly where it was. It's the same window (and the same
 * audio element), so nothing has to be kept in sync between windows.
 *
 * The mini player always sits in a corner of a monitor's work area. It can be
 * dragged, and snaps to the nearest corner when released.
 */

const MINI_WIDTH = 360;
const MINI_HEIGHT = 104;
const MARGIN = 16; // logical px from the screen edges
// Must match the window's minWidth/minHeight in tauri.conf.json
const FULL_MIN_WIDTH = 800;
const FULL_MIN_HEIGHT = 600;
const CORNER_KEY = "audia-mini-corner";
/** Snap this long after the last move if we never see the mouse button released. */
const SNAP_FALLBACK_MS = 600;

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
interface SavedCorner {
  corner: Corner;
  monitor: string | null;
}

const inTauri = "__TAURI_INTERNALS__" in window;

function readSavedCorner(): SavedCorner {
  try {
    const saved = JSON.parse(localStorage.getItem(CORNER_KEY) ?? "null");
    if (["top-left", "top-right", "bottom-left", "bottom-right"].includes(saved?.corner)) return saved;
  } catch {
    // Fall through to the default
  }
  return { corner: "bottom-right", monitor: null };
}

function saveCorner(saved: SavedCorner) {
  try {
    localStorage.setItem(CORNER_KEY, JSON.stringify(saved));
  } catch {
    // Corner just won't be remembered
  }
}

/** Physical position of the window when placed in `corner` of `monitor`'s work area. */
function cornerPosition(monitor: Monitor, corner: Corner, height = MINI_HEIGHT): PhysicalPosition {
  const scale = monitor.scaleFactor;
  const { position, size } = monitor.workArea;
  const left = position.x + MARGIN * scale;
  const top = position.y + MARGIN * scale;
  const right = position.x + size.width - (MINI_WIDTH + MARGIN) * scale;
  const bottom = position.y + size.height - (height + MARGIN) * scale;
  return new PhysicalPosition(
    Math.round(corner.endsWith("left") ? left : right),
    Math.round(corner.startsWith("top") ? top : bottom),
  );
}

function createMiniPlayerState() {
  let active = $state(false);
  let busy = false;
  let fullBounds: { position: PhysicalPosition; size: PhysicalSize; maximized: boolean } | null = null;
  let unlistenMoved: (() => void) | null = null;
  let snapTimer: ReturnType<typeof setTimeout> | null = null;
  let dragging = false;
  /** Corner the mini player is in; panels open away from the screen edge it's against. */
  let corner = $state<Corner>("bottom-right");
  /** Current logical height: MINI_HEIGHT, plus any open panel (see setExtraHeight). */
  let height = MINI_HEIGHT;

  async function monitorUnderWindow(): Promise<Monitor | null> {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    return (await monitorFromPoint(pos.x + size.width / 2, pos.y + size.height / 2)) ?? (await currentMonitor());
  }

  /** Move to the corner nearest the window's centre, on whichever monitor it's on. */
  async function snapToNearestCorner() {
    if (snapTimer) clearTimeout(snapTimer);
    snapTimer = null;
    if (!active) return;
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.outerSize();
    const cx = pos.x + size.width / 2;
    const cy = pos.y + size.height / 2;
    const monitor = (await monitorFromPoint(cx, cy)) ?? (await currentMonitor());
    if (!monitor) return;

    const { position, size: area } = monitor.workArea;
    const vertical = cy < position.y + area.height / 2 ? "top" : "bottom";
    const horizontal = cx < position.x + area.width / 2 ? "left" : "right";
    corner = `${vertical}-${horizontal}` as Corner;
    const target = cornerPosition(monitor, corner, height);
    if (target.x !== pos.x || target.y !== pos.y) await win.setPosition(target);
    saveCorner({ corner, monitor: monitor.name });
  }

  async function enter() {
    if (active || busy || !inTauri) return;
    busy = true;
    try {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) await win.unmaximize();
      fullBounds = { position: await win.outerPosition(), size: await win.outerSize(), maximized };

      active = true;
      height = MINI_HEIGHT;
      await win.setResizable(false);
      await win.setMinSize(new LogicalSize(MINI_WIDTH, MINI_HEIGHT));
      await win.setSize(new LogicalSize(MINI_WIDTH, MINI_HEIGHT));

      // Same corner as last time, on the same monitor if it's still connected
      const saved = readSavedCorner();
      const monitors = await availableMonitors();
      const monitor = monitors.find((m) => m.name === saved.monitor) ?? (await currentMonitor()) ?? monitors[0];
      corner = saved.corner;
      if (monitor) await win.setPosition(cornerPosition(monitor, corner));
      await win.setAlwaysOnTop(settingsState.miniAlwaysOnTop);

      // Snap after every move. The OS owns the drag, so we can't see it end directly:
      // pointerReleased() snaps as soon as the mouse is seen released; this is the fallback.
      unlistenMoved = await win.onMoved(() => {
        if (snapTimer) clearTimeout(snapTimer);
        snapTimer = setTimeout(() => snapToNearestCorner().catch(() => {}), SNAP_FALLBACK_MS);
      });
    } finally {
      busy = false;
    }
  }

  async function exit() {
    if (!active || busy || !inTauri) return;
    busy = true;
    try {
      unlistenMoved?.();
      unlistenMoved = null;
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = null;
      dragging = false;
      height = MINI_HEIGHT;

      const win = getCurrentWindow();
      await win.setAlwaysOnTop(false);
      await win.setMinSize(new LogicalSize(FULL_MIN_WIDTH, FULL_MIN_HEIGHT));
      await win.setResizable(true);
      if (fullBounds) {
        await win.setSize(fullBounds.size);
        await win.setPosition(fullBounds.position);
        if (fullBounds.maximized) await win.maximize();
      } else {
        await win.setSize(new LogicalSize(1100, 750));
      }
      active = false;
    } finally {
      busy = false;
    }
  }

  return {
    get active() {
      return active;
    },
    get corner() {
      return corner;
    },
    /**
     * Grow the mini window by `extra` logical px for a panel (0 to shrink back).
     * It stays anchored to its corner, so in a bottom corner it grows upwards.
     */
    async setExtraHeight(extra: number): Promise<void> {
      if (!active || !inTauri) return;
      height = MINI_HEIGHT + extra;
      const win = getCurrentWindow();
      const monitor = await monitorUnderWindow();
      const target = monitor ? cornerPosition(monitor, corner, height) : null;
      // Growing upwards: move first so the player doesn't flash further down the screen
      if (target && corner.startsWith("bottom") && extra > 0) await win.setPosition(target);
      await win.setSize(new LogicalSize(MINI_WIDTH, height));
      if (target) await win.setPosition(target);
    },
    /** The full window's bounds while in mini mode (what it'll expand back to). */
    get fullBounds() {
      return active ? fullBounds : null;
    },
    enter,
    exit,
    toggle(): Promise<void> {
      return active ? exit() : enter();
    },
    async setAlwaysOnTop(value: boolean): Promise<void> {
      settingsState.miniAlwaysOnTop = value;
      if (active && inTauri) await getCurrentWindow().setAlwaysOnTop(value);
    },
    /** Hand the mouse to the OS to move the window. */
    startDrag(): void {
      if (!active || !inTauri) return;
      dragging = true;
      getCurrentWindow().startDragging();
    },
    /** The page saw the mouse with no button held — if we were dragging, it's over. */
    pointerReleased(): void {
      if (!dragging) return;
      dragging = false;
      snapToNearestCorner().catch(() => {});
    },
  };
}

export const miniPlayerState = createMiniPlayerState();
