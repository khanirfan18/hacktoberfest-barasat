import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatMoney } from "./format";

const redirect = vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); });
const getUser = vi.fn();

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => ({ auth: { getUser } })) }));

describe("GymGo formatting", () => {
  it("formats minor units as money", () => expect(formatMoney(15000)).toContain("150"));
});

describe("role gates", () => {
  beforeEach(() => { getUser.mockReset(); redirect.mockClear(); });

  it("redirects an anonymous visitor to login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { requireRole } = await import("./auth");
    await expect(requireRole("owner")).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
