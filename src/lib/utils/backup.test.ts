import { describe, expect, it } from "vitest";
import { matchBackupBooks, newBookmarks, parseBackup, type BackupBook, type LibraryBookRef } from "./backup";

function entry(key: Partial<BackupBook["key"]>): BackupBook {
  return {
    key: { first_file: null, folder_path: "", title: "", author: "", ...key },
    metadata: {
      title: key.title ?? "",
      author: key.author ?? "",
      narrator: null,
      description: null,
      series: null,
      series_index: null,
      is_favourite: 0,
      cover: null,
    },
    progress: null,
    bookmarks: [],
  };
}

const library: LibraryBookRef[] = [
  { id: 1, folder_path: "C:/Books/Dune", title: "Dune", author: "Herbert", first_file: "C:/Books/Dune/01.mp3" },
  { id: 2, folder_path: "C:/Books", title: "Foundation", author: "Asimov", first_file: "C:/Books/Foundation.m4b" },
  { id: 3, folder_path: "C:/Books", title: "Hyperion", author: "Simmons", first_file: "C:/Books/Hyperion.m4b" },
  { id: 4, folder_path: "D:/Moved/Emma", title: "Emma", author: "Austen", first_file: "D:/Moved/Emma/a.mp3" },
];

describe("parseBackup", () => {
  const valid = { app: "audia", version: 1, exported_at: "x", settings: {}, books: [entry({ title: "A", author: "B" })] };

  it("accepts a valid backup", () => {
    expect(parseBackup(JSON.stringify(valid)).books).toHaveLength(1);
  });

  it("rejects things that aren't backups", () => {
    expect(() => parseBackup("not json")).toThrow(/valid JSON/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/isn't an Audia backup/);
  });

  it("rejects backups from a newer version", () => {
    expect(() => parseBackup(JSON.stringify({ ...valid, version: 99 }))).toThrow(/newer version/);
  });

  it("rejects damaged book entries", () => {
    expect(() => parseBackup(JSON.stringify({ ...valid, books: [{ key: {} }] }))).toThrow(/damaged/);
  });
});

describe("matchBackupBooks", () => {
  it("matches by first file, even when two books share a folder", () => {
    const matches = matchBackupBooks(
      [
        entry({ first_file: "C:/Books/Hyperion.m4b", folder_path: "C:/Books", title: "Hyperion", author: "Simmons" }),
        entry({ first_file: "C:/Books/Foundation.m4b", folder_path: "C:/Books", title: "Foundation", author: "Asimov" }),
      ],
      library,
    );
    expect(matches).toEqual([3, 2]);
  });

  it("falls back to title + author when the book has moved", () => {
    const matches = matchBackupBooks([entry({ first_file: "E:/Old/Emma/a.mp3", folder_path: "E:/Old/Emma", title: "Emma", author: "Austen" })], library);
    expect(matches).toEqual([4]);
  });

  it("returns null for books that aren't in the library", () => {
    expect(matchBackupBooks([entry({ title: "Unknown Book", author: "Nobody" })], library)).toEqual([null]);
  });

  it("never gives one library book to two backup entries", () => {
    const matches = matchBackupBooks(
      [entry({ title: "Dune", author: "Herbert" }), entry({ first_file: "C:/Books/Dune/01.mp3", title: "Dune", author: "Herbert" })],
      library,
    );
    // The strong (file) match wins; the weak title match gets nothing
    expect(matches).toEqual([null, 1]);
  });
});

describe("newBookmarks", () => {
  it("skips bookmarks that already exist", () => {
    const existing = [{ chapter_index: 2, position_secs: 100.2 }];
    const incoming = [
      { chapter_index: 2, position_secs: 100, label: null, created_at: "" },
      { chapter_index: 3, position_secs: 100, label: "new", created_at: "" },
    ];
    expect(newBookmarks(existing, incoming).map((b) => b.label)).toEqual(["new"]);
  });
});
