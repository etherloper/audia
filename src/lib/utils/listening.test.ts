import { describe, expect, it } from "vitest";
import { dayKey, lastNDays, streaks } from "./listening";

const today = new Date(2026, 9, 6); // 6 Oct 2026, local time

describe("dayKey / lastNDays", () => {
  it("formats local dates", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("returns the last n days oldest first, across a month boundary", () => {
    expect(lastNDays(7, today).map(dayKey)).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
    ]);
  });
});

describe("streaks", () => {
  const log = (entries: [string, number][]) => new Map(entries);

  it("counts consecutive days ending today", () => {
    expect(streaks(log([["2026-10-04", 600], ["2026-10-05", 600], ["2026-10-06", 600]]), today)).toEqual({ current: 3, longest: 3 });
  });

  it("keeps the streak alive if you listened yesterday but not yet today", () => {
    expect(streaks(log([["2026-10-04", 600], ["2026-10-05", 600]]), today).current).toBe(2);
  });

  it("breaks after a missed day", () => {
    expect(streaks(log([["2026-10-03", 600], ["2026-10-06", 600]]), today).current).toBe(1);
    expect(streaks(log([["2026-10-03", 600]]), today).current).toBe(0);
  });

  it("ignores days with under a minute", () => {
    expect(streaks(log([["2026-10-05", 30], ["2026-10-06", 600]]), today).current).toBe(1);
  });

  it("finds the longest streak in the past, across month ends", () => {
    const s = streaks(
      log([
        ["2026-08-30", 100],
        ["2026-08-31", 100],
        ["2026-09-01", 100],
        ["2026-09-02", 100],
        ["2026-10-06", 100],
      ]),
      today,
    );
    expect(s).toEqual({ current: 1, longest: 4 });
  });
});
