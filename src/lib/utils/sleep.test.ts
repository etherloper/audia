import { describe, expect, it } from "vitest";
import { formatSleepRemaining } from "./sleep";

describe("formatSleepRemaining", () => {
  it("shows minutes, then seconds in the last minute", () => {
    expect(formatSleepRemaining(30 * 60_000)).toBe("30m");
    expect(formatSleepRemaining(61_000)).toBe("2m");
    expect(formatSleepRemaining(45_000)).toBe("0:45");
    expect(formatSleepRemaining(-5)).toBe("0:00");
  });
});
