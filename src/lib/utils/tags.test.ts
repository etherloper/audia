import { describe, expect, it } from "vitest";
import { countValues, genresFromTag, joinList, listHas, parseList } from "./tags";

describe("parseList / joinList", () => {
  it("round-trips and drops blanks and repeats", () => {
    expect(parseList("Fantasy\n\n fantasy \nAdventure")).toEqual(["Fantasy", "Adventure"]);
    expect(joinList(["Sci-Fi", "  ", "sci-fi", "Horror"])).toBe("Sci-Fi\nHorror");
    expect(joinList([])).toBeNull();
    expect(parseList(null)).toEqual([]);
  });
});

describe("genresFromTag", () => {
  it("splits the usual separators", () => {
    expect(genresFromTag("Fantasy; Science Fiction")).toEqual(["Fantasy", "Science Fiction"]);
    expect(genresFromTag("Thriller/Mystery, Crime")).toEqual(["Thriller", "Mystery", "Crime"]);
    expect(genresFromTag("History\u0000Biography")).toEqual(["History", "Biography"]);
  });

  it("drops generic values and numeric codes", () => {
    expect(genresFromTag("Audiobook")).toEqual([]);
    expect(genresFromTag("(101)Speech")).toEqual([]);
    expect(genresFromTag("Audiobooks; Horror")).toEqual(["Horror"]);
    expect(genresFromTag("12")).toEqual([]);
  });
});

describe("listHas / countValues", () => {
  it("matches ignoring case", () => {
    expect(listHas("Fantasy\nHorror", "horror")).toBe(true);
    expect(listHas(null, "horror")).toBe(false);
  });

  it("counts across books, most common first", () => {
    expect(countValues(["Fantasy\nHorror", "fantasy", null, "Crime"])).toEqual([
      { name: "Fantasy", count: 2 },
      { name: "Crime", count: 1 },
      { name: "Horror", count: 1 },
    ]);
  });
});
