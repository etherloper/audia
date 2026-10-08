/** Playback preferences, persisted to localStorage. */

export const SKIP_OPTIONS = [10, 15, 30, 45, 60] as const;
export const REWIND_ON_RESUME_OPTIONS = [0, 2, 5, 10] as const;
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3] as const;

function readNumber(key: string, fallback: number, allowed?: readonly number[]): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    if (allowed && !allowed.includes(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function write(key: string, value: number | boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable — setting just won't persist
  }
}

function createSettingsState() {
  // Leftovers from the removed "sleep timer at night" setting
  try {
    for (const key of ["audia-auto-sleep", "audia-auto-sleep-start", "audia-auto-sleep-minutes"]) localStorage.removeItem(key);
  } catch {
    // Not important
  }
  let skipBackSecs = $state(readNumber("audia-skip-back", 30, SKIP_OPTIONS));
  let skipForwardSecs = $state(readNumber("audia-skip-forward", 30, SKIP_OPTIONS));
  let rewindOnResumeSecs = $state(readNumber("audia-rewind-on-resume", 2, REWIND_ON_RESUME_OPTIONS));
  let volume = $state(Math.min(1, Math.max(0, readNumber("audia-volume", 1))));
  let closeToTray = $state(readBool("audia-close-to-tray", false));
  let miniAlwaysOnTop = $state(readBool("audia-mini-always-on-top", true));
  let voiceBoost = $state(readBool("audia-voice-boost", false));
  let defaultSpeed = $state(readNumber("audia-default-speed", 1, PLAYBACK_SPEEDS));
  let progressScope = $state<"chapter" | "book">(
    (() => {
      try {
        return localStorage.getItem("audia-progress-scope") === "book" ? "book" : "chapter";
      } catch {
        return "chapter";
      }
    })(),
  );

  return {
    get skipBackSecs() {
      return skipBackSecs;
    },
    set skipBackSecs(v: number) {
      skipBackSecs = v;
      write("audia-skip-back", v);
    },
    get skipForwardSecs() {
      return skipForwardSecs;
    },
    set skipForwardSecs(v: number) {
      skipForwardSecs = v;
      write("audia-skip-forward", v);
    },
    get rewindOnResumeSecs() {
      return rewindOnResumeSecs;
    },
    set rewindOnResumeSecs(v: number) {
      rewindOnResumeSecs = v;
      write("audia-rewind-on-resume", v);
    },
    /** Closing the window hides it to the system tray instead of quitting. */
    get closeToTray() {
      return closeToTray;
    },
    set closeToTray(v: boolean) {
      closeToTray = v;
      write("audia-close-to-tray", v);
    },
    /** What the player's progress bar spans: the current chapter or the whole book. */
    get progressScope() {
      return progressScope;
    },
    set progressScope(v: "chapter" | "book") {
      progressScope = v;
      try {
        localStorage.setItem("audia-progress-scope", v);
      } catch {
        // Won't persist
      }
    },
    /** Start a sleep timer automatically when playback starts at night. */
    /** Speed for books that don't have their own saved speed yet. */
    get defaultSpeed() {
      return defaultSpeed;
    },
    set defaultSpeed(v: number) {
      defaultSpeed = v;
      write("audia-default-speed", v);
    },
    /** Compress and lift narration so quiet passages are easier to hear. */
    get voiceBoost() {
      return voiceBoost;
    },
    set voiceBoost(v: boolean) {
      voiceBoost = v;
      write("audia-voice-boost", v);
    },
    /** Whether the mini player floats above other windows. */
    get miniAlwaysOnTop() {
      return miniAlwaysOnTop;
    },
    set miniAlwaysOnTop(v: boolean) {
      miniAlwaysOnTop = v;
      write("audia-mini-always-on-top", v);
    },
    /** Last volume used, restored on launch. */
    get volume() {
      return volume;
    },
    set volume(v: number) {
      volume = v;
      write("audia-volume", v);
    },
  };
}

export const settingsState = createSettingsState();
