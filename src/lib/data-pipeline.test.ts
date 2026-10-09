import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  extractPriceBlocksFromHtml,
  isPrivateOrBlockedIp,
  parseRobotsDisallows,
  safeFetch,
} from "./scrape";
import { extractPrice, validateAmountInQuote, validateQuoteInText } from "./price";
import { callGemma, extractFirstJsonObject } from "./ai/gemma";

vi.mock("server-only", () => ({}));

// Mock Supabase adminClient
const adminMock = vi.hoisted(() => ({
  adminClient: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));
vi.mock("@/lib/supabase/admin", () => adminMock);
vi.mock("./supabase/admin", () => adminMock);

// Mock @google/genai for Gemma tests
const mockGenerateContent = vi.fn();
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: mockGenerateContent,
      };
    },
  };
});

describe("Data Pipeline Tests", () => {
  let server: http.Server;
  let serverUrl: string;

  beforeAll(async () => {
    process.env.GEMINI_API_KEY = "test-fake-key";
    process.env.SCRAPER_CONTACT = "test@gymgo.demo";

    // Setup local test server for redirect & robots.txt tests
    server = http.createServer((req, res) => {
      const url = req.url || "/";
      if (url === "/robots.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("User-agent: *\nDisallow: /pricing\nDisallow: /restricted\n");
      } else if (url === "/pricing") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>Day pass: $25 per day</body></html>");
      } else if (url === "/redirect-to-private") {
        res.writeHead(302, { Location: "http://127.0.0.1/admin" });
        res.end();
      } else if (url === "/redirect-to-metadata") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest" });
        res.end();
      } else if (url === "/about") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body>About our gym</body></html>");
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  describe("Price Extraction & Quote Validation", () => {
    const fixtureHtml = `
      <html>
        <body>
          <div class="header"><h1>Titan Performance Gym</h1></div>
          <div class="pricing-section">
            <h2>Membership & Drop-in</h2>
            <p>Welcome travellers! Day pass: $25 per day with full locker access.</p>
            <p>Monthly rate: $90 per month.</p>
          </div>
        </body>
      </html>
    `;

    it("real price + matching quote accepted", async () => {
      const extractedText = extractPriceBlocksFromHtml(fixtureHtml);
      expect(extractedText).toContain("Day pass: $25 per day");

      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          day_pass_minor: 2500,
          hourly_minor: null,
          monthly_minor: 9000,
          currency: "USD",
          evidence_quote: "Day pass: $25 per day with full locker access.",
          confidence: 0.95,
        }),
      });

      const result = await extractPrice(extractedText);
      expect(result).not.toBeNull();
      expect(result?.price_minor).toBe(2500);
      expect(result?.price_currency).toBe("USD");
      expect(result?.price_source).toBe("scraped");
      expect(result?.price_evidence).toBe("Day pass: $25 per day with full locker access.");
      expect(result?.price_confidence).toBe(0.95);
    });

    it("hallucinated quote rejected", async () => {
      const extractedText = extractPriceBlocksFromHtml(fixtureHtml);

      // 1. Quote that is NOT a substring of the scraped text
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          day_pass_minor: 1500,
          hourly_minor: null,
          monthly_minor: null,
          currency: "USD",
          evidence_quote: "Special traveller discount: $15 day pass", // hallucinated quote!
          confidence: 0.9,
        }),
      });

      const rejected1 = await extractPrice(extractedText);
      expect(rejected1).toBeNull();

      // 2. Quote where the amount does not appear
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          day_pass_minor: 5000,
          hourly_minor: null,
          monthly_minor: null,
          currency: "USD",
          evidence_quote: "Day pass: $25 per day with full locker access.", // 50 not in quote
          confidence: 0.9,
        }),
      });

      const rejected2 = await extractPrice(extractedText);
      expect(rejected2).toBeNull();
    });
  });

  describe("SSRF & Security Blocking", () => {
    it("127.0.0.1, 169.254.169.254, a private-IP hostname and a redirect to a private IP blocked", async () => {
      // 1. 127.0.0.1 directly blocked
      await expect(safeFetch("https://127.0.0.1/pricing")).rejects.toThrow(/blocked|private/i);

      // 2. 169.254.169.254 directly blocked
      await expect(
        safeFetch("https://169.254.169.254/latest/meta-data")
      ).rejects.toThrow(/blocked|private/i);

      // 3. A private-IP hostname (localhost, internal, etc.) blocked
      await expect(safeFetch("https://localhost/pricing")).rejects.toThrow(/blocked|private/i);
      await expect(safeFetch("https://metadata.google.internal/test")).rejects.toThrow(/blocked|private/i);

      // 4. Redirect to a private IP blocked
      // We test through our local server allowing HTTP for the initial hop, but redirecting to private IP
      await expect(
        safeFetch(`${serverUrl}/redirect-to-private`, { allowHttp: true, skipRobotsCheck: true })
      ).rejects.toThrow(/blocked|private/i);

      await expect(
        safeFetch(`${serverUrl}/redirect-to-metadata`, { allowHttp: true, skipRobotsCheck: true })
      ).rejects.toThrow(/blocked|private/i);
    });

    it("robots disallow honored", async () => {
      // /pricing is disallowed by robots.txt
      await expect(
        safeFetch(`${serverUrl}/pricing`, { allowHttp: true, testAllowLocal: true })
      ).rejects.toThrow(/disallowed by robots\.txt/i);

      // /about is allowed by robots.txt
      const res = await safeFetch(`${serverUrl}/about`, { allowHttp: true, testAllowLocal: true });
      expect(res.ok).toBe(true);
      expect(res.text).toContain("About our gym");
    });
  });

  describe("Gemma AI Parsing & Repair", () => {
    const testSchema = z.object({
      price: z.number(),
      currency: z.string(),
    });

    it("malformed Gemma reply rejected with at most one repair", async () => {
      // Attempt 1: First call returns malformed text, repair call also returns invalid JSON
      mockGenerateContent
        .mockResolvedValueOnce({ text: "I cannot find a price in this text." }) // invalid JSON
        .mockResolvedValueOnce({ text: "Still not JSON format." }); // repair also invalid

      await expect(
        callGemma({
          system: "Extract price",
          user: "Input text",
          schema: testSchema,
        })
      ).rejects.toThrow(/schema validation/i);

      // Total calls must be exactly 2 (initial + 1 repair)
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Verify the repair call was called with ONLY the validation error
      const repairCallArg = mockGenerateContent.mock.calls[1][0];
      expect(repairCallArg.contents).toMatch(/JSON/i);
      expect(repairCallArg.contents).not.toContain("Input text"); // does not contain original user text
    });

    it("malformed Gemma reply successfully repaired on the single repair retry", async () => {
      // Attempt 2: First call returns schema error, repair call fixes it
      mockGenerateContent
        .mockResolvedValueOnce({ text: '{"price": "twenty", "currency": "USD"}' }) // price is string, fails z.number()
        .mockResolvedValueOnce({ text: '{"price": 20, "currency": "USD"}' }); // repair fixes it

      const result = await callGemma({
        system: "Extract price",
        user: "Input text",
        schema: testSchema,
      });

      expect(result).toEqual({ price: 20, currency: "USD" });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });
});
