import type { Bookmark } from "../types";
import { formatDuration } from "./format";

/**
 * A book's bookmarks and notes as Markdown, grouped by chapter in reading order.
 */
export function bookmarksToMarkdown(
  book: { title: string; author: string },
  chapters: { title: string }[],
  bookmarks: Pick<Bookmark, "chapter_index" | "position_secs" | "label">[],
  exportedOn: Date,
): string {
  const sorted = [...bookmarks].sort((a, b) => a.chapter_index - b.chapter_index || a.position_secs - b.position_secs);
  const date = exportedOn.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const lines = [
    `# ${escapeMarkdown(book.title)}`,
    "",
    `${escapeMarkdown(book.author)} · ${sorted.length} ${sorted.length === 1 ? "bookmark" : "bookmarks"} · exported ${date}`,
  ];

  let currentChapter = -1;
  for (const bm of sorted) {
    if (bm.chapter_index !== currentChapter) {
      currentChapter = bm.chapter_index;
      const name = chapters[bm.chapter_index]?.title;
      lines.push("", `## Chapter ${bm.chapter_index + 1}${name ? ` — ${escapeMarkdown(name)}` : ""}`, "");
    }
    const note = bm.label?.trim();
    // Notes can span lines; indent continuation lines so they stay in the list item
    const text = note ? escapeMarkdown(note).replace(/\r?\n/g, "\n  ") : "_Bookmark_";
    lines.push(`- **${formatDuration(bm.position_secs)}** — ${text}`);
  }
  return lines.join("\n") + "\n";
}

/** Escape characters that would otherwise turn text into Markdown formatting. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]#<>|])/g, "\\$1");
}

/** A safe default file name for a book's export. */
export function exportFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${safe || "Bookmarks"} - bookmarks.md`;
}
