import "server-only";
import { z } from "zod";
import { callGemma } from "./ai/gemma";
import { adminClient } from "./supabase/admin";

export const priceExtractionSchema = z.object({
  day_pass_minor: z.number().int().nullable(),
  hourly_minor: z.number().int().nullable(),
  monthly_minor: z.number().int().nullable(),
  currency: z.string().min(1).max(5),
  evidence_quote: z.string().max(120),
  confidence: z.number().min(0).max(1),
});

export type PriceExtraction = z.infer<typeof priceExtractionSchema>;

export interface ExtractedPriceResult {
  price_minor: number;
  price_currency: string;
  price_source: "scraped";
  price_evidence: string;
  price_confidence: number;
}

const STANDARD_CURRENCIES = new Set([
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "NZD",
  "SGD",
]);

export function validateQuoteInText(scrapedText: string, quote: string): boolean {
  if (!quote || quote.trim().length === 0) return false;
  const normScraped = scrapedText.toLowerCase().replace(/\s+/g, " ");
  const normQuote = quote.toLowerCase().replace(/\s+/g, " ").trim();
  return normScraped.includes(normQuote);
}

export function validateAmountInQuote(quote: string, rawMinorAmount: number): boolean {
  if (!quote) return false;
  const major = rawMinorAmount / 100;
  const majorStr = Number.isInteger(major) ? major.toString() : major.toFixed(2);
  const minorStr = rawMinorAmount.toString();
  const strippedQuote = quote.replace(/,/g, "");

  const hasMajor =
    new RegExp(`(?:^|[^0-9])${majorStr}(?:[^0-9]|$)`).test(strippedQuote) ||
    strippedQuote.includes(majorStr);
  const hasMinor = strippedQuote.includes(minorStr);

  return hasMajor || hasMinor;
}

export function checkRangeSanity(
  type: "hourly" | "day_pass" | "monthly",
  minorAmount: number,
  currency: string
): { valid: boolean; confidenceCap?: number } {
  const upperCur = currency.toUpperCase();
  const major = minorAmount / 100;

  if (STANDARD_CURRENCIES.has(upperCur)) {
    if (type === "hourly") {
      if (major >= 1 && major <= 200) return { valid: true };
      return { valid: false };
    }
    if (type === "day_pass") {
      if (major >= 1 && major <= 300) return { valid: true };
      return { valid: false };
    }
    if (type === "monthly") {
      if (major >= 5 && major <= 1000) return { valid: true };
      return { valid: false };
    }
  }

  // Relax for unknown currencies with lower confidence
  if (type === "hourly") {
    if (major >= 1 && major <= 5000) return { valid: true, confidenceCap: 0.5 };
    return { valid: false };
  }
  if (type === "day_pass") {
    if (major >= 1 && major <= 10000) return { valid: true, confidenceCap: 0.5 };
    return { valid: false };
  }
  if (type === "monthly") {
    if (major >= 5 && major <= 50000) return { valid: true, confidenceCap: 0.5 };
    return { valid: false };
  }

  return { valid: false };
}

export async function extractPrice(
  scrapedText: string,
  options?: {
    gymId?: string;
    sourceUrl?: string;
    modelOverride?: string;
  }
): Promise<ExtractedPriceResult | null> {
  if (!scrapedText || scrapedText.trim().length === 0) {
    return null;
  }

  const system = `You are a strict price extraction engine for gym facilities.
Rules:
1. Extract ONLY prices that literally appear in the scraped text.
2. If a price does not literally appear, you MUST return null for that field. Never guess, assume, or invent prices.
3. Minor units means integer minor units (e.g. $25 -> 2500, €15.50 -> 1550, £10 -> 1000, ₹500 -> 50000).
4. currency must be an ISO currency code (USD, EUR, GBP, INR, etc.) if identifiable, or the currency symbol if not.
5. evidence_quote MUST be an exact verbatim substring from the text (<=120 chars) containing the price amount.
6. confidence must be a number between 0 and 1.
Output valid JSON only with keys: day_pass_minor, hourly_minor, monthly_minor, currency, evidence_quote, confidence.`;

  const user = `Extract gym pricing from the following scraped text:\n\n${scrapedText}`;

  let parsed: PriceExtraction;
  try {
    parsed = await callGemma<PriceExtraction>({
      system,
      user,
      schema: priceExtractionSchema,
      modelOverride: options?.modelOverride,
    });
  } catch {
    return null;
  }

  const quote = parsed.evidence_quote;

  // In code check 1: Quote MUST be a substring of scraped text
  if (!validateQuoteInText(scrapedText, quote)) {
    return null;
  }

  // Pick hourly > day pass > monthly/20 (estimated)
  let chosenMinor: number | null = null;
  let rawAmountToCheck: number | null = null;
  let chosenType: "hourly" | "day_pass" | "monthly" | null = null;

  if (parsed.hourly_minor !== null) {
    chosenType = "hourly";
    chosenMinor = parsed.hourly_minor;
    rawAmountToCheck = parsed.hourly_minor;
  } else if (parsed.day_pass_minor !== null) {
    chosenType = "day_pass";
    chosenMinor = parsed.day_pass_minor;
    rawAmountToCheck = parsed.day_pass_minor;
  } else if (parsed.monthly_minor !== null) {
    chosenType = "monthly";
    chosenMinor = Math.round(parsed.monthly_minor / 20);
    rawAmountToCheck = parsed.monthly_minor;
  }

  if (chosenMinor === null || rawAmountToCheck === null || chosenType === null) {
    return null;
  }

  // In code check 2: Amount MUST appear in the quote
  if (!validateAmountInQuote(quote, rawAmountToCheck)) {
    return null;
  }

  // Range sanity check
  const sanity = checkRangeSanity(chosenType, rawAmountToCheck, parsed.currency);
  if (!sanity.valid) {
    return null;
  }

  let finalConfidence = parsed.confidence;
  if (sanity.confidenceCap !== undefined) {
    finalConfidence = Math.min(finalConfidence, sanity.confidenceCap);
  }

  const result: ExtractedPriceResult = {
    price_minor: chosenMinor,
    price_currency: parsed.currency.toUpperCase(),
    price_source: "scraped",
    price_evidence: quote,
    price_confidence: finalConfidence,
  };

  // Store in database if gymId provided
  if (options?.gymId) {
    try {
      await adminClient
        .from("gyms")
        .update({
          price_minor: result.price_minor,
          price_currency: result.price_currency,
          price_source: "scraped",
          price_scraped_at: new Date().toISOString(),
          price_source_url: options.sourceUrl ?? null,
          price_evidence: result.price_evidence,
          price_confidence: result.price_confidence,
        })
        .eq("id", options.gymId);
    } catch {}
  }

  return result;
}
