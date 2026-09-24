import { describe, expect, it, vi } from "vitest";

import {
  daysTogether,
  nextOccurrence,
  parseLocalDate,
  shanghaiToday,
} from "../../src/lib/local-date";

describe("local dates", () => {
  it("accepts a canonical calendar date without converting time zones", () => {
    expect(parseLocalDate("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects calendar-invalid and non-canonical dates", () => {
    for (const value of ["2025-02-29", "2024-2-9", "2024-13-01", ""] as const) {
      expect(() => parseLocalDate(value)).toThrow();
    }
  });

  it("counts the start date as day one", () => {
    expect(daysTogether("2026-09-23", "2026-09-23")).toBe(1);
    expect(daysTogether("2026-09-22", "2026-09-23")).toBe(2);
  });

  it("counts correctly across years 0099 and 0100", () => {
    expect(daysTogether("0099-12-31", "0100-01-01")).toBe(2);
  });

  it("finds the next yearly occurrence and maps leap day to February 28", () => {
    expect(nextOccurrence("2024-02-29", "2025-02-01")).toBe("2025-02-28");
    expect(nextOccurrence("2024-02-29", "2025-03-01")).toBe("2026-02-28");
    expect(nextOccurrence("2023-09-23", "2026-09-23")).toBe("2026-09-23");
  });

  it("derives today in Asia/Shanghai rather than the process time zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T16:30:00.000Z"));
    expect(shanghaiToday()).toBe("2026-09-23");
    vi.useRealTimers();
  });
});
