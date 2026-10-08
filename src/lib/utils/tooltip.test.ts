import { describe, expect, it } from "vitest";
import { splitShortcut } from "./tooltip";

describe("splitShortcut", () => {
  it("splits a trailing shortcut", () => {
    expect(splitShortcut("Search (Ctrl+K)")).toEqual(["Search", "Ctrl+K"]);
    expect(splitShortcut("Expand (Ctrl+Shift+M)")).toEqual(["Expand", "Ctrl+Shift+M"]);
    expect(splitShortcut("Close (Esc)")).toEqual(["Close", "Esc"]);
    expect(splitShortcut("Add bookmark (B)")).toEqual(["Add bookmark", "B"]);
  });

  it("leaves ordinary brackets alone", () => {
    expect(splitShortcut("Time left (at 1.5×)")).toEqual(["Time left (at 1.5×)", null]);
    expect(splitShortcut("Edition (2011)")).toEqual(["Edition (2011)", null]);
    expect(splitShortcut("Play")).toEqual(["Play", null]);
  });
});
