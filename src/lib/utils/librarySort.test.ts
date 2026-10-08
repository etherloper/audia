import { describe, expect, it } from "vitest";
import type { Book } from "../types";
import { compareNames, sortBooks, type SortProgress } from "./librarySort";

function book(id: number, title: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    title,
    author: "Author",
    narrator: null,
    cover_art: null,
    description: null,
    folder_path: "",
    total_duration_secs: 1000,
    is_favourite: 0,
    series: null,
    series_index: null,
    genres: null,
    tags: null,
    cover_fetch_attempted_at: null,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ...extra,
  };
}

const p = (book_position_secs: number, updated_at = "2026-01-01 00:00:00", finished_at: string | null = null): SortProgress => ({
  book_position_secs,
  updated_at,
  finished_at,
});

const titles = (books: Book[]) => books.map((b) => b.title);

describe("sortBooks", () => {
  const books = [
    book(1, "Cosmos", { created_at: "2026-03-01 00:00:00", total_duration_secs: 500 }),
    book(2, "Animal Farm", { created_at: "2026-01-01 00:00:00", total_duration_secs: 9000 }),
    book(3, "Beloved", { created_at: "2026-02-01 00:00:00", total_duration_secs: 2000 }),
    book(4, "Dune", { created_at: "2026-04-01 00:00:00", total_duration_secs: 2000 }),
  ];

  it("sorts by title", () => {
    expect(titles(sortBooks(books, "title", new Map()))).toEqual(["Animal Farm", "Beloved", "Cosmos", "Dune"]);
  });

  it("sorts by most recently added", () => {
    expect(titles(sortBooks(books, "added", new Map()))).toEqual(["Dune", "Cosmos", "Beloved", "Animal Farm"]);
  });

  it("sorts shortest first, breaking ties by title", () => {
    expect(titles(sortBooks(books, "length", new Map()))).toEqual(["Cosmos", "Beloved", "Dune", "Animal Farm"]);
  });

  it("sorts by last played, unplayed books last", () => {
    const progress = new Map([
      [3, p(10, "2026-05-01 10:00:00")],
      [1, p(10, "2026-05-02 09:00:00")],
    ]);
    expect(titles(sortBooks(books, "recent", progress))).toEqual(["Cosmos", "Beloved", "Animal Farm", "Dune"]);
  });

  it("sorts by progress: in progress (furthest first), then not started, then finished", () => {
    const progress = new Map([
      [1, p(100)], // 20%
      [2, p(0, "2026-01-01 00:00:00", "2026-06-01 00:00:00")], // finished
      [3, p(1500)], // 75%
    ]);
    expect(titles(sortBooks(books, "progress", progress))).toEqual(["Beloved", "Cosmos", "Dune", "Animal Farm"]);
  });

  it("doesn't mutate the input", () => {
    const copy = [...books];
    sortBooks(books, "length", new Map());
    expect(books).toEqual(copy);
  });
});

describe("compareNames", () => {
  it("orders numbers naturally and ignores case", () => {
    const names = ["Part 10", "part 2", "Part 1", "Series 12", "Series 4"];
    expect([...names].sort(compareNames)).toEqual(["Part 1", "part 2", "Part 10", "Series 4", "Series 12"]);
  });
});
