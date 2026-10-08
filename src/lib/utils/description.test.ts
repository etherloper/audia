import { describe, expect, it } from "vitest";
import { descriptionParagraphs, htmlToPlainText } from "./description";

describe("descriptionParagraphs", () => {
  it("splits on each line break and drops blank lines", () => {
    expect(descriptionParagraphs("First.\nSecond.\n\n\nThird.")).toEqual(["First.", "Second.", "Third."]);
  });

  it("handles Windows line endings and tidies spaces", () => {
    expect(descriptionParagraphs("  One  two \r\n\r\n Three\r")).toEqual(["One two", "Three"]);
  });

  it("returns nothing for empty input", () => {
    expect(descriptionParagraphs(null)).toEqual([]);
    expect(descriptionParagraphs(" \n ")).toEqual([]);
  });
});

describe("htmlToPlainText", () => {
  it("keeps paragraph and line breaks", () => {
    expect(htmlToPlainText("<p>One <b>bold</b></p><p>Two<br>Three</p>")).toBe("One bold\nTwo\nThree");
  });

  it("decodes entities", () => {
    expect(htmlToPlainText("Tom &amp; Jerry &#8212; it&#39;s &quot;fun&quot;&hellip;")).toBe('Tom & Jerry — it\'s "fun"…');
  });
});
