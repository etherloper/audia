import type { Book, SortOption } from "../types";

export interface SortProgress {
  book_position_secs: number;
  finished_at: string | null;
  updated_at: string;
}

export const SORT_LABELS: Record<SortOption, string> = {
  title: "A – Z",
  author: "Author",
  recent: "Recently played",
  added: "Recently added",
  length: "Shortest",
  progress: "Progress",
};

/** Compare names the way people expect: "Part 2" before "Part 10", case-insensitive. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const compareNames = (a: string, b: string) => collator.compare(a, b);

/** 0–1 through the book; finished counts as 1. */
function fraction(book: Book, p: SortProgress | undefined): number {
  if (!p) return 0;
  if (p.finished_at) return 1;
  return book.total_duration_secs > 0 ? Math.min(1, p.book_position_secs / book.total_duration_secs) : 0;
}

/**
 * "Progress" order: books you're partway through (furthest along first), then
 * ones not started, then finished ones — finished books are done, so they go last.
 */
function progressRank(book: Book, p: SortProgress | undefined): number {
  if (p?.finished_at) return 2;
  return fraction(book, p) > 0 ? 0 : 1;
}

export function sortBooks(books: Book[], sortBy: SortOption, progress: Map<number, SortProgress>): Book[] {
  const byTitle = (a: Book, b: Book) => compareNames(a.title, b.title);
  const compare: (a: Book, b: Book) => number = (() => {
    switch (sortBy) {
      case "title":
        return byTitle;
      case "author":
        return (a, b) => compareNames(a.author, b.author) || byTitle(a, b);
      case "recent": {
        // Last listened (SQLite UTC timestamps compare correctly as strings); unplayed last
        const played = (b: Book) => progress.get(b.id)?.updated_at ?? "";
        return (a, b) => played(b).localeCompare(played(a)) || byTitle(a, b);
      }
      case "added":
        return (a, b) => b.created_at.localeCompare(a.created_at) || byTitle(a, b);
      case "length":
        return (a, b) => a.total_duration_secs - b.total_duration_secs || byTitle(a, b);
      case "progress":
        return (a, b) => {
          const pa = progress.get(a.id);
          const pb = progress.get(b.id);
          return (
            progressRank(a, pa) - progressRank(b, pb) || fraction(b, pb) - fraction(a, pa) || byTitle(a, b)
          );
        };
    }
  })();
  return [...books].sort(compare);
}
