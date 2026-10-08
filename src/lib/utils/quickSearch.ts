import type { Book } from "../types";
import { compareNames } from "./librarySort";
import { countValues } from "./tags";

/** A bookmark with a note, as searched by quick search. */
export interface NoteRef {
  id: number;
  book_id: number;
  book_title: string;
  chapter_index: number;
  position_secs: number;
  label: string;
}

export type QuickResult =
  | { kind: "book"; book: Book; match: string }
  | { kind: "author"; name: string; count: number }
  | { kind: "series"; name: string; count: number }
  | { kind: "genre"; name: string; count: number }
  | { kind: "tag"; name: string; count: number }
  | { kind: "note"; note: NoteRef };

const PER_SECTION = 6;

/**
 * How well `text` matches `query`: 3 = whole text starts with it, 2 = a word
 * starts with it, 1 = contains it, 0 = no match. Case- and accent-insensitive.
 */
export function matchScore(text: string | null | undefined, query: string): number {
  if (!text) return 0;
  const t = fold(text);
  const q = fold(query);
  if (!q) return 0;
  if (t.startsWith(q)) return 3;
  if (t.includes(" " + q) || t.includes("-" + q) || t.includes("(" + q)) return 2;
  return t.includes(q) ? 1 : 0;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Search books, authors, series, genres, tags and bookmark notes. Results are ordered best first per section. */
export function quickSearch(query: string, books: Book[], notes: NoteRef[]): QuickResult[] {
  if (!fold(query)) return [];

  // Books: title matters most, then author, series, narrator
  const bookHits = books
    .map((book) => {
      const fields: [string, number][] = [
        ["title", matchScore(book.title, query) * 4],
        ["author", matchScore(book.author, query) * 2],
        ["series", matchScore(book.series, query) * 2],
        ["narrator", matchScore(book.narrator, query)],
      ];
      const [match, score] = fields.reduce((best, f) => (f[1] > best[1] ? f : best));
      return { book, match, score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || compareNames(a.book.title, b.book.title))
    .slice(0, PER_SECTION)
    .map((h): QuickResult => ({ kind: "book", book: h.book, match: h.match }));

  const grouped = (values: (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const v of values) if (v && v !== "Unknown") counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, score: matchScore(name, query) }))
      .filter((g) => g.score > 0)
      .sort((a, b) => b.score - a.score || compareNames(a.name, b.name))
      .slice(0, PER_SECTION);
  };
  const authors = grouped(books.map((b) => b.author)).map(
    (g): QuickResult => ({ kind: "author", name: g.name, count: g.count }),
  );
  const series = grouped(books.map((b) => b.series)).map(
    (g): QuickResult => ({ kind: "series", name: g.name, count: g.count }),
  );

  const listed = (values: { name: string; count: number }[]) =>
    values
      .map((v) => ({ ...v, score: matchScore(v.name, query) }))
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score || compareNames(a.name, b.name))
      .slice(0, PER_SECTION);
  const genres = listed(countValues(books.map((b) => b.genres))).map(
    (g): QuickResult => ({ kind: "genre", name: g.name, count: g.count }),
  );
  const tags = listed(countValues(books.map((b) => b.tags))).map(
    (t): QuickResult => ({ kind: "tag", name: t.name, count: t.count }),
  );

  const noteHits = notes
    .map((note) => ({ note, score: matchScore(note.label, query) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, PER_SECTION)
    .map((h): QuickResult => ({ kind: "note", note: h.note }));

  return [...bookHits, ...authors, ...series, ...genres, ...tags, ...noteHits];
}
