import { describe, expect, it } from "vitest";
import { getLocalDate, isGymOpenNow, type OpeningHours } from "./explore";

describe("timezone-aware gym hours", () => {
  it("uses the gym's local weekday and clock for open-now", () => {
    const hours: OpeningHours = { thu: [["06:00", "22:00"]] };
    const now = new Date("2026-10-08T12:00:00.000Z");
    expect(isGymOpenNow(hours, "Asia/Kolkata", now)).toBe(true);
    expect(isGymOpenNow(hours, "America/Los_Angeles", now)).toBe(false);
  });

  it("treats closing time as closed and returns the local date", () => {
    const hours: OpeningHours = { thu: [["06:00", "18:00"]] };
    const now = new Date("2026-10-08T12:30:00.000Z");
    expect(isGymOpenNow(hours, "Asia/Kolkata", now)).toBe(false);
    expect(getLocalDate(now, "Asia/Kolkata")).toBe("2026-10-08");
  });
});
