import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GymReview } from "@/lib/queries/gym";

const { callGemma, modelCall, cache } = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  const modelCall = vi.fn();
  const callGemma = vi.fn(async (options: {
    cacheKey: string;
    user: string;
    schema: { parse: (value: unknown) => unknown };
  }) => {
    if (cache.has(options.cacheKey)) return cache.get(options.cacheKey);
    modelCall();
    const result = options.schema.parse({
      vibe: "Friendly, focused training floor",
      pros: ["Helpful staff"],
      cons: [],
      best_time: "Morning",
    });
    cache.set(options.cacheKey, result);
    return result;
  });
  return { callGemma, modelCall, cache };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gemma", () => ({ callGemma }));

describe("gym review summary", () => {
  beforeEach(() => {
    cache.clear();
    callGemma.mockClear();
    modelCall.mockClear();
  });

  it("uses a stable input hash and returns the cached result without another model call", async () => {
    const { getGymSummary } = await import("./gym-summary");
    const reviews: GymReview[] = [
      { id: "1", rating: 5, body: "Great place", verified: true, createdAt: "2026-01-01" },
      { id: "2", rating: 4, body: "Helpful staff", verified: false, createdAt: "2026-01-02" },
      { id: "3", rating: 5, body: "Clean equipment", verified: true, createdAt: "2026-01-03" },
    ];
    const hours = { mon: [["06:00", "22:00"]] };
    const first = await getGymSummary(reviews, ["Dumbbells"], hours);
    const second = await getGymSummary(reviews, ["Dumbbells"], hours);
    expect(first).toEqual(second);
    expect(callGemma).toHaveBeenCalledTimes(2);
    expect(callGemma.mock.calls[0][0].cacheKey).toBe(callGemma.mock.calls[1][0].cacheKey);
    expect(modelCall).toHaveBeenCalledTimes(1);
  });

  it("bounds the prompt and removes email and phone details from review text", async () => {
    const { getGymSummary } = await import("./gym-summary");
    const reviews: GymReview[] = [
      { id: "1", rating: 5, body: `Contact me test.person@example.com at +91 98765 43210. ${"A".repeat(700)}`, verified: false, createdAt: "2026-01-01" },
    ];
    await getGymSummary(reviews, [], {});
    const options = callGemma.mock.calls[0][0];
    expect(options.user.length).toBeLessThanOrEqual(3000);
    expect(options.user).not.toContain("test.person@example.com");
    expect(options.user).not.toContain("98765");
  });
});
