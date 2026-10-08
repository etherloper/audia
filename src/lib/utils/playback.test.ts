import { describe, expect, it } from "vitest";
import {
  bookDuration,
  bookPosition,
  chapterBoundaries,
  locateInBook,
  planChapterLoad,
  planSkip,
  remapPosition,
  resumePoint,
  shouldAutoAdvance,
  shouldRewindOnResume,
  type ChapterSpan,
} from "./playback";

// An .m4b: three chapters in one file
const m4b: ChapterSpan[] = [
  { file_path: "book.m4b", start_offset_secs: 0, duration_secs: 600 },
  { file_path: "book.m4b", start_offset_secs: 600, duration_secs: 900 },
  { file_path: "book.m4b", start_offset_secs: 1500, duration_secs: 300 },
];

// A folder of MP3s: one file per chapter
const mp3s: ChapterSpan[] = [
  { file_path: "01.mp3", start_offset_secs: 0, duration_secs: 120 },
  { file_path: "02.mp3", start_offset_secs: 0, duration_secs: 200 },
  { file_path: "03.mp3", start_offset_secs: 0, duration_secs: 5 },
];

const lengths = (chs: ChapterSpan[]) => chs.map((c) => c.duration_secs);

describe("bookPosition / bookDuration", () => {
  it("adds up earlier chapters", () => {
    expect(bookPosition(m4b, 0, 30)).toBe(30);
    expect(bookPosition(m4b, 2, 10)).toBe(600 + 900 + 10);
    expect(bookDuration(m4b)).toBe(1800);
  });
});

describe("planChapterLoad", () => {
  it("reloads only when the file changes", () => {
    expect(planChapterLoad(null, mp3s[0], 0).reload).toBe(true);
    expect(planChapterLoad("01.mp3", mp3s[1], 0).reload).toBe(true);
    expect(planChapterLoad("book.m4b", m4b[2], 0).reload).toBe(false);
  });

  it("seeks to the chapter's offset in the shared file", () => {
    expect(planChapterLoad("book.m4b", m4b[1], 15).fileSeekSecs).toBe(615);
  });

  // Regression: chapter 1 → chapter 3 → chapter 1 jumped to chapter 2. Going back
  // to the first chapter of a shared file doesn't reload it, and the old code
  // skipped the seek because the target was 0, leaving playback in chapter 3.
  it("still seeks when returning to the first chapter of a shared file", () => {
    const plan = planChapterLoad("book.m4b", m4b[0], 0);
    expect(plan.reload).toBe(false);
    expect(plan.fileSeekSecs).toBe(0);
  });
});

describe("shouldAutoAdvance", () => {
  it("advances when playback reaches the end of a shared-file chapter", () => {
    expect(shouldAutoAdvance(m4b[0], 599.8, 1800, false)).toBe(true);
    expect(shouldAutoAdvance(m4b[1], 1500.5, 1800, false)).toBe(true);
  });

  it("doesn't advance mid-chapter", () => {
    expect(shouldAutoAdvance(m4b[0], 300, 1800, false)).toBe(false);
  });

  // The other half of the chapter-1 regression: a position far past the end
  // means we're out of sync, not that the chapter finished.
  it("doesn't advance when the position is far past the chapter's end", () => {
    expect(shouldAutoAdvance(m4b[0], 1600, 1800, false)).toBe(false);
  });

  it("leaves the last chapter and separate files to the 'ended' event", () => {
    expect(shouldAutoAdvance(m4b[2], 1799.9, 1800, true)).toBe(false);
    expect(shouldAutoAdvance(mp3s[0], 119.9, 120, false)).toBe(false);
  });
});

describe("planSkip", () => {
  it("seeks within the chapter when there's room", () => {
    expect(planSkip(lengths(mp3s), 0, 50, 30)).toEqual({ kind: "seek", position: 80 });
    expect(planSkip(lengths(mp3s), 0, 50, -30)).toEqual({ kind: "seek", position: 20 });
  });

  it("carries a forward overshoot into the next chapter", () => {
    expect(planSkip(lengths(mp3s), 0, 110, 30)).toEqual({ kind: "jump", chapterIndex: 1, position: 20 });
  });

  it("carries a backward overshoot into the end of the previous chapter", () => {
    expect(planSkip(lengths(mp3s), 1, 10, -30)).toEqual({ kind: "jump", chapterIndex: 0, position: 100 });
    expect(planSkip(lengths(m4b), 2, 0, -15)).toEqual({ kind: "jump", chapterIndex: 1, position: 885 });
  });

  it("doesn't overshoot a very short next chapter", () => {
    expect(planSkip(lengths(mp3s), 1, 195, 30)).toEqual({ kind: "jump", chapterIndex: 2, position: 4 });
  });

  it("stops at the start of the book and near the end of the last chapter", () => {
    expect(planSkip(lengths(mp3s), 0, 10, -30)).toEqual({ kind: "seek", position: 0 });
    expect(planSkip(lengths(mp3s), 2, 2, 30)).toEqual({ kind: "seek", position: 4.5 });
  });
});

describe("resumePoint", () => {
  const saved = { chapter_index: 1, position_secs: 100, finished_at: null };

  it("resumes the saved spot, stepped back by the rewind setting", () => {
    expect(resumePoint(saved, 3, 5)).toEqual({ chapterIndex: 1, position: 95 });
  });

  it("doesn't rewind before the chapter start", () => {
    expect(resumePoint({ ...saved, position_secs: 1 }, 3, 5)).toEqual({ chapterIndex: 1, position: 0 });
  });

  it("starts finished or new books from the beginning", () => {
    expect(resumePoint({ ...saved, finished_at: "2026-01-01 00:00:00" }, 3, 5)).toEqual({ chapterIndex: 0, position: 0 });
    expect(resumePoint(undefined, 3, 5)).toEqual({ chapterIndex: 0, position: 0 });
  });

  it("clamps a chapter index from an older, longer chapter list", () => {
    expect(resumePoint({ ...saved, chapter_index: 9 }, 3, 0)).toEqual({ chapterIndex: 2, position: 100 });
  });

  it("uses an explicit start (bookmark, chapter pick) as-is", () => {
    expect(resumePoint(saved, 3, 5, { chapterIndex: 2, positionSecs: 42 })).toEqual({ chapterIndex: 2, position: 42 });
  });
});

describe("shouldRewindOnResume", () => {
  it("rewinds only after a real pause", () => {
    expect(shouldRewindOnResume(null, 10_000, 3000)).toBe(false);
    expect(shouldRewindOnResume(9000, 10_000, 3000)).toBe(false);
    expect(shouldRewindOnResume(5000, 10_000, 3000)).toBe(true);
  });
});

describe("remapPosition", () => {
  it("keeps the same moment when one long chapter gains embedded chapters", () => {
    const before = [{ duration_secs: 1800 }];
    expect(remapPosition(before, m4b, 0, 1000)).toEqual({ chapterIndex: 1, positionSecs: 400 });
  });

  it("maps positions back the other way", () => {
    expect(remapPosition(m4b, [{ duration_secs: 1800 }], 2, 30)).toEqual({ chapterIndex: 0, positionSecs: 1530 });
  });

  it("puts a position past the end into the last chapter", () => {
    expect(remapPosition([{ duration_secs: 5000 }], m4b, 0, 4000)).toEqual({ chapterIndex: 2, positionSecs: 2500 });
  });
});

describe("locateInBook / chapterBoundaries", () => {
  it("finds the chapter for a book-wide time", () => {
    expect(locateInBook(m4b, 0)).toEqual({ chapterIndex: 0, positionSecs: 0 });
    expect(locateInBook(m4b, 700)).toEqual({ chapterIndex: 1, positionSecs: 100 });
    expect(locateInBook(m4b, 1500)).toEqual({ chapterIndex: 2, positionSecs: 0 });
  });

  it("clamps times outside the book", () => {
    expect(locateInBook(m4b, -5)).toEqual({ chapterIndex: 0, positionSecs: 0 });
    expect(locateInBook(m4b, 5000)).toEqual({ chapterIndex: 2, positionSecs: 300 });
  });

  it("lists where each later chapter starts", () => {
    expect(chapterBoundaries(m4b)).toEqual([600, 1500]);
    expect(chapterBoundaries([{ duration_secs: 10 }])).toEqual([]);
  });
});
