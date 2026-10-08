/**
 * Pure position maths for the player. Kept free of audio/DB/state so it can be
 * unit-tested — this is where the subtle bugs live (chapters sharing a file,
 * skipping across chapter boundaries, resuming, remapping saved positions).
 *
 * Positions are "chapter-relative" (seconds from the chapter's start) unless a
 * name says otherwise. A chapter's audio lives at `start_offset_secs` within its
 * file; chapters of an .m4b share one file, other books have one file each.
 */

export interface ChapterSpan {
  file_path: string;
  duration_secs: number;
  start_offset_secs: number;
}

/** Seconds from the start of the book. */
export function bookPosition(chapters: { duration_secs: number }[], chapterIndex: number, positionSecs: number): number {
  let pos = positionSecs;
  for (let i = 0; i < chapterIndex && i < chapters.length; i++) pos += chapters[i].duration_secs;
  return pos;
}

export function bookDuration(chapters: { duration_secs: number }[]): number {
  return chapters.reduce((sum, ch) => sum + ch.duration_secs, 0);
}

/** What loading a chapter involves: whether the file must be (re)loaded, and where to seek in it. */
export function planChapterLoad(currentFilePath: string | null, chapter: ChapterSpan, seekTo: number) {
  return {
    reload: currentFilePath !== chapter.file_path,
    // Always seek — even to 0. A shared file isn't reloaded, so skipping the seek
    // would leave playback wherever the previous chapter was.
    fileSeekSecs: chapter.start_offset_secs + seekTo,
  };
}

export type SkipPlan =
  | { kind: "seek"; position: number }
  | { kind: "jump"; chapterIndex: number; position: number };

/**
 * Skip by `delta` seconds (negative = back) from `position` in chapter `index`,
 * carrying any overshoot into the neighbouring chapter. `lengths` are the
 * chapters' durations.
 */
export function planSkip(lengths: number[], index: number, position: number, delta: number): SkipPlan {
  const target = position + delta;
  const len = lengths[index] ?? 0;

  if (delta >= 0) {
    if (target < len) return { kind: "seek", position: target };
    if (index < lengths.length - 1) {
      const nextLen = lengths[index + 1];
      const carry = target - len;
      // Don't overshoot the next chapter too (very short chapters)
      return { kind: "jump", chapterIndex: index + 1, position: nextLen > 0 ? Math.min(carry, Math.max(0, nextLen - 1)) : carry };
    }
    return { kind: "seek", position: Math.max(0, len - 0.5) };
  }

  if (target >= 0) return { kind: "seek", position: target };
  if (index > 0) {
    return { kind: "jump", chapterIndex: index - 1, position: Math.max(0, lengths[index - 1] + target) };
  }
  return { kind: "seek", position: 0 };
}

/**
 * For chapters that share a file, the audio element won't fire "ended" at a
 * chapter boundary, so we watch the time and advance ourselves — but only when
 * playback actually runs into the end. A position far past the end means we're
 * out of sync, and advancing would skip a chapter.
 */
export function shouldAutoAdvance(chapter: ChapterSpan, fileTime: number, fileDuration: number, isLastChapter: boolean): boolean {
  if (isLastChapter) return false;
  const sharesFile =
    chapter.start_offset_secs > 0 || (chapter.duration_secs > 0 && chapter.duration_secs < fileDuration - 1);
  if (!sharesFile) return false;
  const end = chapter.start_offset_secs + chapter.duration_secs;
  return fileTime >= end - 0.3 && fileTime < end + 2;
}

export interface SavedProgress {
  chapter_index: number;
  position_secs: number;
  finished_at: string | null;
}

/** Where to start when opening a book. */
export function resumePoint(
  saved: SavedProgress | undefined,
  chapterCount: number,
  rewindSecs: number,
  start?: { chapterIndex: number; positionSecs: number },
): { chapterIndex: number; position: number } {
  if (start) return { chapterIndex: start.chapterIndex, position: start.positionSecs };
  // Finished books start again from the beginning
  if (!saved || saved.finished_at) return { chapterIndex: 0, position: 0 };
  return {
    chapterIndex: Math.min(Math.max(0, saved.chapter_index), chapterCount - 1),
    // Resuming from a previous session counts as a long pause
    position: Math.max(0, saved.position_secs - rewindSecs),
  };
}

/** Rewind on resume only after a real pause, not a quick toggle. */
export function shouldRewindOnResume(pausedAt: number | null, now: number, minPauseMs: number): boolean {
  return pausedAt !== null && now - pausedAt >= minPauseMs;
}

/**
 * Map a (chapter, position) from one chapter layout to another through the
 * book-wide position — used when a rescan changes a book's chapters.
 */
export function remapPosition(
  oldChapters: { duration_secs: number }[],
  newChapters: { duration_secs: number }[],
  chapterIndex: number,
  positionSecs: number,
): { chapterIndex: number; positionSecs: number } {
  const target = bookPosition(oldChapters, chapterIndex, positionSecs);
  let start = 0;
  for (let i = 0; i < newChapters.length; i++) {
    if (target < start + newChapters[i].duration_secs || i === newChapters.length - 1) {
      return { chapterIndex: i, positionSecs: Math.max(0, target - start) };
    }
    start += newChapters[i].duration_secs;
  }
  return { chapterIndex: 0, positionSecs: 0 };
}

/** Which chapter (and where in it) a book-wide time falls in. Clamped to the book. */
export function locateInBook(chapters: { duration_secs: number }[], bookSecs: number): { chapterIndex: number; positionSecs: number } {
  const clamped = Math.min(Math.max(0, bookSecs), bookDuration(chapters));
  return remapPosition([{ duration_secs: Number.POSITIVE_INFINITY }], chapters, 0, clamped);
}

/** Book-wide start time of each chapter after the first — tick marks on a whole-book timeline. */
export function chapterBoundaries(chapters: { duration_secs: number }[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (let i = 0; i < chapters.length - 1; i++) {
    t += chapters[i].duration_secs;
    starts.push(t);
  }
  return starts;
}
