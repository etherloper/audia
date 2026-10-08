import { playerState } from "./player.svelte";
import { uiState } from "./ui.svelte";
import { formatSleepRemaining } from "../utils/sleep";

/**
 * The sleep timer. Lives here rather than in the SleepTimer button so it keeps
 * running when the player bar isn't on screen (e.g. in mini player mode).
 */

type Mode = { kind: "off" } | { kind: "timed"; endsAt: number; minutes: number } | { kind: "chapterEnd" };

const EXTEND_MINUTES = 5;
/** End-of-chapter: start fading this long before the chapter ends, so it ends on the boundary. */
const CHAPTER_FADE_MS = 3000;

function createSleepTimer() {
  let mode = $state<Mode>({ kind: "off" });
  let now = $state(Date.now());
  let ticker: ReturnType<typeof setInterval> | null = null;
  let warned = false;
  let fading = false;

  let remainingMs = $derived(mode.kind === "timed" ? Math.max(0, mode.endsAt - now) : 0);

  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  async function fadeOut(ms: number) {
    if (fading) return;
    fading = true;
    cancel();
    try {
      await playerState.fadeAndPause(ms);
    } finally {
      fading = false;
    }
  }

  function tick() {
    now = Date.now();
    if (mode.kind !== "timed") return;
    const left = mode.endsAt - now;
    if (left <= 0) {
      fadeOut(5000);
    } else if (left <= 60_000 && !warned) {
      warned = true;
      uiState.showToast("Sleep timer ends in 1 minute.", {
        durationMs: 15_000,
        action: { label: `+${EXTEND_MINUTES} min`, run: () => extend() },
      });
    }
  }

  function start(minutes: number) {
    stopTicker();
    warned = false;
    now = Date.now();
    mode = { kind: "timed", endsAt: now + minutes * 60_000, minutes };
    ticker = setInterval(tick, 1000);
  }

  function startChapterEnd() {
    stopTicker();
    mode = { kind: "chapterEnd" };
  }

  /** Add time to a running timer (a chapter-end timer becomes a timed one). */
  function extend(minutes = EXTEND_MINUTES) {
    if (mode.kind === "timed") {
      mode = { ...mode, endsAt: Math.max(mode.endsAt, Date.now()) + minutes * 60_000 };
      warned = false;
    } else {
      start(minutes);
    }
  }

  function cancel() {
    stopTicker();
    mode = { kind: "off" };
  }

  $effect.root(() => {
    // End of chapter: fade so playback stops right at the boundary
    $effect(() => {
      if (mode.kind !== "chapterEnd" || !playerState.isPlaying || playerState.duration <= 0) return;
      const leftMs = ((playerState.duration - playerState.currentTime) / playerState.playbackRate) * 1000;
      if (leftMs <= CHAPTER_FADE_MS + 500) fadeOut(Math.max(500, leftMs - 300));
    });
  });

  return {
    get mode() {
      return mode;
    },
    get active() {
      return mode.kind !== "off";
    },
    get remainingMs() {
      return remainingMs;
    },
    /** Short label for badges: "12m", "0:45" or "Ch end". */
    get display() {
      if (mode.kind === "timed") return formatSleepRemaining(remainingMs);
      if (mode.kind === "chapterEnd") return "Ch end";
      return "";
    },
    start,
    startChapterEnd,
    extend,
    cancel,
  };
}

export const sleepTimerState = createSleepTimer();
