import { describe, expect, it } from "vitest";
import { bookmarksToMarkdown, exportFileName } from "./bookmarkExport";

const book = { title: "Dune", author: "Frank Herbert" };
const chapters = [{ title: "Arrakis" }, { title: "The Litany" }, { title: "Muad'Dib" }];
const date = new Date(2026, 9, 6);

describe("bookmarksToMarkdown", () => {
  it("groups bookmarks by chapter in order, with notes", () => {
    const md = bookmarksToMarkdown(
      book,
      chapters,
      [
        { chapter_index: 2, position_secs: 30, label: null },
        { chapter_index: 1, position_secs: 754, label: "Fear is the mind-killer" },
        { chapter_index: 1, position_secs: 65, label: "  " },
      ],
      date,
    );
    expect(md).toContain("# Dune");
    expect(md).toContain("Frank Herbert · 3 bookmarks · exported");
    const body = md.slice(md.indexOf("## "));
    expect(body).toBe(
      [
        "## Chapter 2 — The Litany",
        "",
        "- **1:05** — _Bookmark_",
        "- **12:34** — Fear is the mind-killer",
        "",
        "## Chapter 3 — Muad'Dib",
        "",
        "- **0:30** — _Bookmark_",
        "",
      ].join("\n"),
    );
  });

  it("escapes Markdown characters and keeps multi-line notes in the list item", () => {
    const md = bookmarksToMarkdown(book, chapters, [{ chapter_index: 0, position_secs: 3700, label: "*Important*\nsecond line" }], date);
    expect(md).toContain("- **1:01:40** — \\*Important\\*\n  second line");
  });
});

describe("exportFileName", () => {
  it("removes characters Windows doesn't allow", () => {
    expect(exportFileName('Who: "Me"? / You*')).toBe("Who Me You - bookmarks.md");
    expect(exportFileName("???")).toBe("Bookmarks - bookmarks.md");
  });
});
