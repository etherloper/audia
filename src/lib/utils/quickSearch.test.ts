import { describe, expect, it } from "vitest";
import type { Book } from "../types";
import { matchScore, quickSearch, type NoteRef } from "./quickSearch";

function book(id: number, title: string, author: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    title,
    author,
    narrator: null,
    cover_art: null,
    description: null,
    folder_path: "",
    total_duration_secs: 0,
    is_favourite: 0,
    series: null,
    series_index: null,
    genres: null,
    tags: null,
    cover_fetch_attempted_at: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

const books = [
  book(1, "The Left Hand of Darkness", "Ursula K. Le Guin", { series: "Hainish Cycle" }),
  book(2, "The Dispossessed", "Ursula K. Le Guin", { series: "Hainish Cycle" }),
  book(3, "Dune", "Frank Herbert", { series: "Dune" }),
  book(4, "Darkness at Noon", "Arthur Koestler", { narrator: "Frank Muller" }),
  book(5, "Émile", "Jean-Jacques Rousseau"),
];

const notes: NoteRef[] = [
  { id: 1, book_id: 3, book_title: "Dune", chapter_index: 2, position_secs: 60, label: "Fear is the mind-killer" },
];

describe("matchScore", () => {
  it("prefers prefix, then word start, then substring", () => {
    expect(matchScore("Darkness at Noon", "dark")).toBe(3);
    expect(matchScore("The Left Hand of Darkness", "dark")).toBe(2);
    expect(matchScore("Sundark", "dark")).toBe(1);
    expect(matchScore("Dune", "dark")).toBe(0);
  });

  it("ignores case and accents", () => {
    expect(matchScore("Émile", "emile")).toBe(3);
    expect(matchScore("emile", "ÉMILE")).toBe(3);
  });

  it("treats empty or missing text as no match", () => {
    expect(matchScore(null, "a")).toBe(0);
    expect(matchScore("abc", "  ")).toBe(0);
  });
});

describe("quickSearch", () => {
  it("returns nothing for an empty query", () => {
    expect(quickSearch("   ", books, notes)).toEqual([]);
  });

  it("ranks title prefix matches above word matches", () => {
    const titles = quickSearch("dark", books, notes)
      .filter((r) => r.kind === "book")
      .map((r) => (r.kind === "book" ? r.book.title : ""));
    expect(titles).toEqual(["Darkness at Noon", "The Left Hand of Darkness"]);
  });

  it("groups authors and series with book counts", () => {
    const results = quickSearch("le guin", books, notes);
    expect(results.find((r) => r.kind === "author")).toEqual({ kind: "author", name: "Ursula K. Le Guin", count: 2 });
    expect(quickSearch("hainish", books, notes).find((r) => r.kind === "series")).toEqual({
      kind: "series",
      name: "Hainish Cycle",
      count: 2,
    });
  });

  it("matches books by narrator and says why", () => {
    const hit = quickSearch("muller", books, notes).find((r) => r.kind === "book");
    expect(hit).toMatchObject({ kind: "book", match: "narrator" });
  });

  it("finds bookmark notes", () => {
    const hit = quickSearch("mind-killer", books, notes).find((r) => r.kind === "note");
    expect(hit).toMatchObject({ kind: "note", note: { book_id: 3 } });
  });

  it("orders sections: books, authors, series, notes", () => {
    const kinds = quickSearch("dune", books, notes).map((r) => r.kind);
    expect(kinds).toEqual(["book", "series"]);
  });

  it("finds genres and tags with book counts", () => {
    const tagged = [
      book(10, "A", "X", { genres: "Science Fiction\nSpace Opera" }),
      book(11, "B", "Y", { genres: "science fiction", tags: "Re-listen" }),
    ];
    expect(quickSearch("science", tagged, [])).toContainEqual({ kind: "genre", name: "Science Fiction", count: 2 });
    expect(quickSearch("re-lis", tagged, [])).toContainEqual({ kind: "tag", name: "Re-listen", count: 1 });
  });
});
