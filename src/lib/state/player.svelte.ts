import type { Chapter } from "../types";
import { audioEngine } from "../utils/audio";
import { getDb } from "../utils/db";
import { libraryState } from "./library.svelte";
import { uiState } from "./ui.svelte";
import { PLAYBACK_SPEEDS, settingsState } from "./settings.svelte";
import { formatDuration } from "../utils/format";
import { dayKey } from "../utils/listening";
import { logWarn } from "../utils/log";
import {
  bookDuration,
  bookPosition as bookPositionOf,
  locateInBook,
  planChapterLoad,
  planSkip,
  resumePoint,
  shouldAutoAdvance,
  shouldRewindOnResume,
} from "../utils/playback";

/** Pauses shorter than this resume exactly where they left off. */
const REWIND_MIN_PAUSE_MS = 3000;

function createPlayerState() {
  let currentBookId = $state<number | null>(null);
  let currentChapterIndex = $state(0);
  let currentChapters = $state<Chapter[]>([]);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let playbackRate = $state(1.0);
  let volume = $state(settingsState.volume);
  let currentFilePath = $state<string | null>(null);

  let progressPercent = $derived(
    duration > 0 ? (currentTime / duration) * 100 : 0,
  );

  let currentChapter = $derived(
    currentChapters[currentChapterIndex] || null,
  );

  let overallProgressPercent = $derived.by(() => {
    if (currentChapters.length === 0) return 0;
    const totalDuration = currentChapters.reduce(
      (sum, ch) => sum + ch.duration_secs,
      0,
    );
    if (totalDuration === 0) return 0;
    return (bookPosition() / totalDuration) * 100;
  });

  /** Audio time left in the whole book (not adjusted for speed). */
  let bookRemainingSecs = $derived(Math.max(0, bookDuration(currentChapters) - bookPosition()));

  let saveTimer: ReturnType<typeof setInterval> | null = null;
  let advancingChapter = false;
  let pausedAt: number | null = null;
  let volumeBeforeMute = volume > 0 ? volume : 1;

  audioEngine.setVolume(volume);
  if (settingsState.voiceBoost) audioEngine.setVoiceBoost(true);
  audioEngine.onBoostUnavailable = () => {
    settingsState.voiceBoost = false;
    uiState.showToast("Voice boost isn't available for this audio, so it's been turned off.");
  };

  function chapterDuration(index: number): number {
    const chapter = currentChapters[index];
    if (!chapter) return 0;
    if (chapter.duration_secs > 0) return chapter.duration_secs;
    return index === currentChapterIndex ? audioEngine.duration : 0;
  }

  /** Seconds from the start of the book. */
  function bookPosition(): number {
    return bookPositionOf(currentChapters, currentChapterIndex, currentTime);
  }


  audioEngine.onTimeUpdate = (rawTime, rawDur) => {
    if (advancingChapter) return;

    const chapter = currentChapters[currentChapterIndex];
    if (!chapter) {
      currentTime = rawTime;
      duration = rawDur;
      return;
    }

    // Always show time relative to chapter start and use chapter duration
    currentTime = Math.max(0, rawTime - chapter.start_offset_secs);
    duration = chapter.duration_secs > 0 ? chapter.duration_secs : rawDur;

    // Chapters that share a file don't get an "ended" event at their boundary
    if (shouldAutoAdvance(chapter, rawTime, rawDur, currentChapterIndex >= currentChapters.length - 1)) {
      advancingChapter = true;
      loadChapter(currentChapterIndex + 1).then((ok) => {
        if (ok) audioEngine.play();
        advancingChapter = false;
      });
    }
  };

  audioEngine.onPlay = () => {
    isPlaying = true;
    pausedAt = null;
  };

  audioEngine.onPause = () => {
    isPlaying = false;
    pausedAt = Date.now();
  };

  audioEngine.onEnded = async () => {
    if (currentChapterIndex < currentChapters.length - 1) {
      if (await loadChapter(currentChapterIndex + 1)) audioEngine.play();
    } else {
      isPlaying = false;
      await markCurrentBookFinished();
    }
  };

  /** Returns false if the chapter's file couldn't be loaded (e.g. moved or deleted). */
  async function loadChapter(index: number, seekTo: number = 0): Promise<boolean> {
    if (index < 0 || index >= currentChapters.length) return false;
    const chapter = currentChapters[index];
    const plan = planChapterLoad(currentFilePath, chapter, seekTo);

    // Only reload file if it's different (M4B chapters share a file)
    if (plan.reload) {
      try {
        await audioEngine.loadFile(chapter.file_path);
      } catch {
        audioEngine.pause();
        reportMissingFile(chapter);
        return false;
      }
      currentFilePath = chapter.file_path;
    }
    currentChapterIndex = index;

    audioEngine.setPlaybackRate(playbackRate);
    audioEngine.setVolume(volume);

    audioEngine.seek(plan.fileSeekSecs);

    currentTime = seekTo;
    duration = chapter.start_offset_secs > 0 ? chapter.duration_secs : (audioEngine.duration || chapter.duration_secs);
    return true;
  }

  function reportMissingFile(chapter: Chapter) {
    logWarn(`Couldn't load audio file ${chapter.file_path} (book ${chapter.book_id})`);
    const bookId = chapter.book_id;
    const fileName = chapter.file_path.split(/[\\/]/).pop();
    uiState.showToast(`Couldn't play "${fileName}". The book's files may have been moved or deleted.`, {
      kind: "error",
      durationMs: 12000,
      action: {
        label: "Locate folder…",
        run: async () => {
          if (await libraryState.relocateBook(bookId)) await openBook(bookId);
        },
      },
    });
  }

  async function saveProgress(listenedDelta: number = 0) {
    if (currentBookId === null) return;
    const db = await getDb();
    await db.execute(
      `INSERT INTO progress (book_id, chapter_index, position_secs, playback_rate, book_position_secs, listened_secs, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
       ON CONFLICT(book_id) DO UPDATE SET
         chapter_index = $2,
         position_secs = $3,
         playback_rate = $4,
         book_position_secs = $5,
         listened_secs = listened_secs + $6,
         updated_at = datetime('now')`,
      [currentBookId, currentChapterIndex, currentTime, playbackRate, bookPosition(), listenedDelta],
    );
    await db.execute(
      "UPDATE books SET updated_at = datetime('now') WHERE id = $1",
      [currentBookId],
    );
    if (listenedDelta > 0) {
      await db.execute(
        `INSERT INTO listening_log (day, book_id, seconds) VALUES ($1, $2, $3)
         ON CONFLICT(day, book_id) DO UPDATE SET seconds = seconds + $3`,
        [dayKey(new Date()), currentBookId, listenedDelta],
      );
    }
  }

  async function markCurrentBookFinished() {
    if (currentBookId === null) return;
    await saveProgress();
    const db = await getDb();
    await db.execute(
      "UPDATE progress SET finished_at = datetime('now') WHERE book_id = $1",
      [currentBookId],
    );
    await libraryState.loadProgress();
    const book = libraryState.getBook(currentBookId);
    if (book) uiState.showToast(`Finished "${book.title}".`, { kind: "success" });
  }

  function startSaveTimer() {
    stopSaveTimer();
    saveTimer = setInterval(() => {
      if (!isPlaying || currentBookId === null) return;
      saveProgress(5).catch(() => {});
    }, 5000);
  }

  function stopSaveTimer() {
    if (saveTimer !== null) {
      clearInterval(saveTimer);
      saveTimer = null;
    }
  }

  /** Seek within the current chapter (seconds from chapter start). */
  function seek(time: number): void {
    const chapter = currentChapters[currentChapterIndex];
    audioEngine.seek((chapter?.start_offset_secs ?? 0) + time);
    currentTime = time;
  }

  function rewindBy(seconds: number) {
    if (seconds > 0) seek(Math.max(0, currentTime - seconds));
  }

  function pause(): void {
    audioEngine.pause();
    saveProgress().catch(() => {});
  }

  /** Play, stepping back a little first if playback was paused for a while. */
  function resume(): void {
    if (shouldRewindOnResume(pausedAt, Date.now(), REWIND_MIN_PAUSE_MS)) {
      rewindBy(settingsState.rewindOnResumeSecs);
    }
    audioEngine.play();
  }

  /** Load a chapter at a position and keep playing if we were playing. */
  async function jumpTo(index: number, position: number = 0): Promise<void> {
    const wasPlaying = isPlaying;
    if (!(await loadChapter(index, position))) return;
    if (wasPlaying) audioEngine.play();
    saveProgress().catch(() => {});
  }

  function goToChapter(index: number): Promise<void> {
    return jumpTo(index, 0);
  }

  /** Skip by `delta` seconds (negative = back), crossing into neighbouring chapters. */
  function skipBy(delta: number): void {
    const lengths = currentChapters.map((_, i) => chapterDuration(i));
    const plan = planSkip(lengths, currentChapterIndex, currentTime, delta);
    if (plan.kind === "seek") seek(plan.position);
    else jumpTo(plan.chapterIndex, plan.position);
  }

  function skipForward(seconds: number = settingsState.skipForwardSecs): void {
    skipBy(seconds);
  }

  function skipBackward(seconds: number = settingsState.skipBackSecs): void {
    skipBy(-seconds);
  }

  async function openBook(bookId: number, start?: { chapterIndex: number; positionSecs: number }): Promise<void> {
    // Already loaded: just move within it
    if (start && currentBookId === bookId && currentChapters.length > 0) {
      if (await loadChapter(start.chapterIndex, start.positionSecs)) audioEngine.play();
      saveProgress().catch(() => {});
      return;
    }

    const chapters = await libraryState.loadChapters(bookId);
    if (chapters.length === 0) return;

    // Save the outgoing book's position before switching
    if (currentBookId !== null && currentBookId !== bookId) await saveProgress();

    // Work out where to resume before switching anything, so the UI never shows the
    // book at chapter 1 while the saved position is still being read
    const db = await getDb();
    const [progress] = await db.select<
      { chapter_index: number; position_secs: number; playback_rate: number; finished_at: string | null }[]
    >("SELECT chapter_index, position_secs, playback_rate, finished_at FROM progress WHERE book_id = $1", [
      bookId,
    ]);
    const { chapterIndex, position } = resumePoint(progress, chapters.length, settingsState.rewindOnResumeSecs, start);

    audioEngine.pause();
    currentBookId = bookId;
    currentChapters = chapters;
    currentChapterIndex = chapterIndex;
    currentTime = position;
    currentFilePath = null;

    // Books keep their own speed once played; new ones start at the default
    playbackRate = progress?.playback_rate ?? settingsState.defaultSpeed;
    // Listening again (from the start, or from a bookmark) un-finishes the book
    if (progress?.finished_at) {
      await db.execute("UPDATE progress SET finished_at = NULL WHERE book_id = $1", [bookId]);
      await libraryState.loadProgress();
    }

    if (!(await loadChapter(chapterIndex, position))) {
      clearState();
      return;
    }

    audioEngine.play();
    startSaveTimer();
  }

  function clearState(): void {
    stopSaveTimer();
    audioEngine.pause();
    currentBookId = null;
    currentChapters = [];
    currentChapterIndex = 0;
    currentTime = 0;
    duration = 0;
    isPlaying = false;
    currentFilePath = null;
    pausedAt = null;
  }

  return {
    get currentBookId() {
      return currentBookId;
    },
    get currentChapterIndex() {
      return currentChapterIndex;
    },
    get currentChapters() {
      return currentChapters;
    },
    get currentChapter() {
      return currentChapter;
    },
    get isPlaying() {
      return isPlaying;
    },
    get currentTime() {
      return currentTime;
    },
    get duration() {
      return duration;
    },
    get playbackRate() {
      return playbackRate;
    },
    get volume() {
      return volume;
    },
    get progressPercent() {
      return progressPercent;
    },
    get overallProgressPercent() {
      return overallProgressPercent;
    },
    get bookRemainingSecs() {
      return bookRemainingSecs;
    },
    /** Seconds from the start of the book. */
    get bookPositionSecs() {
      return bookPosition();
    },
    get bookDurationSecs() {
      return bookDuration(currentChapters);
    },

    /** Seek to a book-wide time, moving to another chapter if needed. */
    seekBook(bookSecs: number): void {
      const { chapterIndex, positionSecs } = locateInBook(currentChapters, bookSecs);
      if (chapterIndex === currentChapterIndex) seek(positionSecs);
      else jumpTo(chapterIndex, positionSecs);
    },

    openBook,

    togglePlayPause(): void {
      if (isPlaying) pause();
      else resume();
    },

    skipForward,
    skipBackward,
    seek,
    goToChapter,

    setPlaybackRate(rate: number): void {
      playbackRate = rate;
      audioEngine.setPlaybackRate(rate);
    },

    /** Step to the next faster (+1) or slower (-1) preset speed. */
    stepPlaybackRate(direction: 1 | -1): void {
      const speeds = PLAYBACK_SPEEDS as readonly number[];
      const next =
        direction > 0
          ? speeds.find((s) => s > playbackRate + 0.001)
          : [...speeds].reverse().find((s) => s < playbackRate - 0.001);
      if (next !== undefined) this.setPlaybackRate(next);
    },

    /** Turn voice boost on/off, keeping the setting in step with what actually happened. */
    setVoiceBoost(on: boolean): void {
      const result = audioEngine.setVoiceBoost(on);
      settingsState.voiceBoost = result;
      if (on && !result) uiState.showToast("Voice boost isn't available for this audio.");
    },

    toggleMute(): void {
      if (volume > 0) {
        volumeBeforeMute = volume;
        this.setVolume(0);
      } else {
        this.setVolume(volumeBeforeMute);
      }
    },

    setVolume(v: number): void {
      volume = Math.min(1, Math.max(0, v));
      audioEngine.setVolume(volume);
      settingsState.volume = volume;
    },

    async addBookmark(): Promise<void> {
      if (currentBookId === null) return;
      const chapterIndex = currentChapterIndex;
      const position = currentTime;
      await libraryState.addBookmark(currentBookId, chapterIndex, position);
      uiState.showToast(`Bookmark added · Ch ${chapterIndex + 1} · ${formatDuration(position)}`, { durationMs: 2500, kind: "success" });
    },

    async stop(): Promise<void> {
      await saveProgress();
      clearState();
    },

    clearState,

    saveProgress: () => saveProgress(),

    async fadeAndPause(durationMs: number = 30000): Promise<void> {
      await audioEngine.fadeVolume(0, durationMs);
      audioEngine.pause();
      audioEngine.setVolume(volume);
      await saveProgress();
    },
  };
}

export const playerState = createPlayerState();
