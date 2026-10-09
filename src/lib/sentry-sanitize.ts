import * as Sentry from "@sentry/nextjs";

const secretNames = [
  "GEMINI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "QR_SECRET",
  "CRON_SECRET",
] as const;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactText(value: string): string {
  let redacted = value;
  for (const name of secretNames) {
    const secret = process.env[name];
    if (secret) redacted = redacted.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[REDACTED]");
  }
  return redacted.replace(emailPattern, "[REDACTED_EMAIL]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, scrubValue(entry)]),
    );
  }
  return value;
}

export function sanitizeSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const cleaned = scrubValue(event) as Sentry.ErrorEvent;
  if (cleaned.request) {
    delete cleaned.request.headers;
    delete cleaned.request.cookies;
    delete cleaned.request.query_string;
    if (cleaned.request.url) {
      try {
        const url = new URL(cleaned.request.url);
        url.search = "";
        cleaned.request.url = url.toString();
      } catch {
        cleaned.request.url = cleaned.request.url.split("?")[0];
      }
    }
  }
  delete cleaned.user;
  return cleaned;
}
