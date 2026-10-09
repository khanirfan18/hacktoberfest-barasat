import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { type z } from "zod";
import { adminClient } from "../supabase/admin";
import { captureError } from "../monitoring";

export interface CallGemmaOptions<T> {
  system?: string;
  user: string;
  schema: z.ZodType<T>;
  cacheKey?: string;
  modelOverride?: string;
}

function resolveGemmaModel(override?: string): string {
  let model = override || process.env.GEMMA_MODEL;
  if (!model) {
    try {
      const p = path.join(process.cwd(), "stage0_results.json");
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (raw?.gemma_model) {
          model = raw.gemma_model;
        }
      }
    } catch {}
  }
  model = model || "gemma-4-31b-it";
  if (!model.toLowerCase().includes("gemma")) {
    throw new Error(`Invalid model name: "${model}". Model name must contain 'gemma'.`);
  }
  return model;
}

export function extractFirstJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(match[0]);
}

async function executeGenerateContent(
  model: string,
  promptText: string,
  timeoutMs = 20_000
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const ai = new GoogleGenAI({ apiKey });
  const candidates = [model];
  if (model !== "gemma-4-26b-a4b-it") {
    candidates.push("gemma-4-26b-a4b-it");
  }

  let lastError: unknown;
  for (const m of candidates) {
    if (!m.toLowerCase().includes("gemma")) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemma request timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        );

        const callPromise = ai.models.generateContent({
          model: m,
          contents: promptText,
          config: {
            temperature: 0,
          },
        });

        const res = await Promise.race([callPromise, timeoutPromise]);
        clearTimeout(timer);
        return res.text ?? "";
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      lastError = err;
      // If 500/INTERNAL error from Google, try the fallback Gemma model
      if (err?.status === 500 || (typeof err?.message === "string" && err.message.includes("500"))) {
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("Failed to generate content with Gemma");
}

export async function callGemma<T>({
  system,
  user,
  schema,
  cacheKey,
  modelOverride,
}: CallGemmaOptions<T>): Promise<T> {
  const model = resolveGemmaModel(modelOverride);

  // Compute cache key: sha256(model+system+user)
  const computedHash = crypto
    .createHash("sha256")
    .update(`${model}${system ?? ""}${user}`)
    .digest("hex");
  const finalKey = cacheKey ?? computedHash;

  // Check ai_cache in DB
  try {
    const { data: cached } = await adminClient
      .from("ai_cache")
      .select("value")
      .eq("key", finalKey)
      .maybeSingle();

    if (cached?.value) {
      const parsedCached = schema.safeParse(cached.value);
      if (parsedCached.success) {
        return parsedCached.data;
      }
    }
  } catch {
    // If cache lookup fails, proceed to generate
  }

  // Put system instruction at top of user prompt
  const initialPrompt = system ? `${system}\n\n${user}` : user;
  let rawResponse: string;
  try {
    rawResponse = await executeGenerateContent(model, initialPrompt);
  } catch (error) {
    captureError("gemma", error);
    throw error;
  }

  let parsed: unknown;
  let parseError: string = "";
  try {
    parsed = extractFirstJsonObject(rawResponse);
  } catch (err: any) {
    parseError = err?.message || "Invalid JSON format";
  }

  const initialValidation = parsed !== undefined ? schema.safeParse(parsed) : null;
  if (initialValidation?.success) {
    try {
      await adminClient.from("ai_cache").upsert(
        {
          key: finalKey,
          kind: "gemma",
          value: initialValidation.data as any,
        },
        { onConflict: "key" }
      );
    } catch {}
    return initialValidation.data;
  }

  // Validation failed: ONE repair call containing only the validation error
  const validationErrorMsg =
    initialValidation && !initialValidation.success
      ? initialValidation.error.message
      : parseError || "Invalid JSON";

  let repairedResponse: string;
  try {
    repairedResponse = await executeGenerateContent(model, validationErrorMsg);
  } catch (error) {
    captureError("gemma", error);
    throw new Error(`Gemma response failed schema validation: ${validationErrorMsg}`);
  }

  let repairedParsed: unknown;
  try {
    repairedParsed = extractFirstJsonObject(repairedResponse);
  } catch (err: any) {
    throw new Error(
      `Gemma response failed schema validation after repair: ${err?.message || validationErrorMsg}`
    );
  }

  const repairValidation = schema.safeParse(repairedParsed);
  if (repairValidation.success) {
    try {
      await adminClient.from("ai_cache").upsert(
        {
          key: finalKey,
          kind: "gemma",
          value: repairValidation.data as any,
        },
        { onConflict: "key" }
      );
    } catch {}
    return repairValidation.data;
  }

  throw new Error(
    `Gemma response failed schema validation after repair: ${repairValidation.error.message}`
  );
}
