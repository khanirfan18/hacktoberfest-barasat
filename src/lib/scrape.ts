import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import { adminClient } from "./supabase/admin";
import { captureError } from "./monitoring";

export interface SafeFetchOptions {
  allowHttp?: boolean;
  skipRobotsCheck?: boolean;
  testAllowLocal?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface SafeFetchResponse {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
}

export function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (broadcast / current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (private)
    if (a === 10) return true;
    // 100.64.0.0/10 (carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, cloud metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (private: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 & 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    // 192.168.0.0/16 (private)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (reserved)
    if (a >= 240) return true;
    // 255.255.255.255 (broadcast)
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback ::1
    if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
    // Unspecified ::
    if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
    // Unique local fc00::/7 (starts with fc or fd)
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // Link local fe80::/10 (fe8, fe9, fea, feb)
    if (/^fe[89ab]/i.test(lower)) return true;
    // IPv4-mapped IPv6 ::ffff:127.0.0.1
    if (lower.includes("::ffff:")) {
      const v4Part = lower.split("::ffff:")[1];
      if (net.isIPv4(v4Part)) {
        return isPrivateOrBlockedIp(v4Part);
      }
    }
    return false;
  }

  return true;
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new Error(`Blocked private IP address: ${hostname}`);
    }
    return;
  }

  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal")
  ) {
    throw new Error(`Blocked private hostname: ${hostname}`);
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch (err: any) {
    throw new Error(`DNS resolution failed for ${hostname}: ${err?.message}`);
  }

  if (!records || records.length === 0) {
    throw new Error(`No DNS records found for ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrBlockedIp(record.address)) {
      throw new Error(`Blocked private IP ${record.address} for hostname ${hostname}`);
    }
  }
}

const robotsCache = new Map<string, string[]>();

export function parseRobotsDisallows(content: string): string[] {
  const lines = content.split("\n");
  let appliesToUs = false;
  const disallowed: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === "user-agent") {
      const agent = value.toLowerCase();
      appliesToUs = agent === "*" || agent === "gymgobot" || agent.includes("gymgo");
    } else if (appliesToUs && directive === "disallow") {
      if (value) {
        disallowed.push(value);
      }
    }
  }
  return disallowed;
}

export async function isRobotsAllowed(
  targetUrl: string,
  allowHttp = false,
  testAllowLocal = false
): Promise<boolean> {
  const parsed = new URL(targetUrl);
  const origin = parsed.origin;
  const pathname = parsed.pathname || "/";

  let disallowedPaths = robotsCache.get(origin);
  if (disallowedPaths === undefined) {
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const res = await safeFetch(robotsUrl, {
        skipRobotsCheck: true,
        allowHttp,
        testAllowLocal,
      });
      if (res.ok && res.status === 200) {
        disallowedPaths = parseRobotsDisallows(res.text);
      } else {
        disallowedPaths = [];
      }
    } catch {
      disallowedPaths = [];
    }
    robotsCache.set(origin, disallowedPaths);
  }

  for (const pattern of disallowedPaths) {
    if (pattern === "/" || pathname.startsWith(pattern)) {
      return false;
    }
  }
  return true;
}

export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResponse> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = targetUrl;
  let redirectCount = 0;

  const contact = process.env.SCRAPER_CONTACT || "contact@gymgo.demo";
  const userAgent = `GymGoBot/0.1 (+${contact})`;

  while (true) {
    const parsed = new URL(currentUrl);

    // Protocol check: https only unless allowHttp is true
    if (!options.allowHttp && parsed.protocol !== "https:") {
      throw new Error(`Scraper requires HTTPS: ${currentUrl}`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }

    // DNS & IP safety check
    if (!options.testAllowLocal) {
      await assertPublicHost(parsed.hostname);
    }

    // Robots.txt check
    if (!options.skipRobotsCheck) {
      const allowed = await isRobotsAllowed(
        currentUrl,
        options.allowHttp,
        options.testAllowLocal
      );
      if (!allowed) {
        throw new Error(`Scraping disallowed by robots.txt: ${currentUrl}`);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Check for redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (max ${maxRedirects} allowed)`);
      }
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect ${res.status} missing Location header`);
      }
      const nextUrl = new URL(location, currentUrl).href;

      // Validate next URL protocol & host before following
      const nextParsed = new URL(nextUrl);
      if (!options.allowHttp && nextParsed.protocol !== "https:") {
        throw new Error(`Redirect target requires HTTPS: ${nextUrl}`);
      }
      if (!options.testAllowLocal) {
        await assertPublicHost(nextParsed.hostname);
      }

      currentUrl = nextUrl;
      continue;
    }

    // Check Content-Length cap: 1MB = 1048576 bytes
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      throw new Error(`Content length ${contentLength} exceeds 1MB cap`);
    }

    // Stream and cap body at 1MB
    if (!res.body) {
      return { ok: res.ok, status: res.status, text: "", finalUrl: currentUrl };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          receivedBytes += value.length;
          if (receivedBytes > 1_048_576) {
            await reader.cancel();
            throw new Error("Response body exceeded 1MB cap");
          }
          chunks.push(value);
        }
      }
    } finally {
      // Reader cleanup
    }

    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    for (const chunk of chunks) {
      fullText += decoder.decode(chunk, { stream: true });
    }
    fullText += decoder.decode();

    return {
      ok: res.ok,
      status: res.status,
      text: fullText,
      finalUrl: currentUrl,
    };
  }
}

export async function logScrapeAttempt(
  gymId: string | null,
  url: string,
  ok: boolean,
  status: number | null,
  errorClass: string | null
): Promise<void> {
  try {
    await adminClient.from("scrape_log").insert({
      gym_id: gymId,
      url,
      ok,
      http_status: status,
      error_class: errorClass,
    });
  } catch {}
}

const PRICE_KEYWORDS_REGEX =
  /(?:price|pricing|membership|day\s*pass|drop-in|per\s*month|\/month|per\s*day|per\s*hour|[\$€£₹¥])/i;

export function extractPriceBlocksFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript, svg, iframe, form, button").remove();

  const blocks: string[] = [];

  // Inspect block elements and paragraphs
  $("h1, h2, h3, h4, h5, h6, p, li, tr, dt, dd, section").each((_, elem) => {
    const text = $(elem).text().replace(/\s+/g, " ").trim();
    if (text && PRICE_KEYWORDS_REGEX.test(text)) {
      blocks.push(text);
    }
  });

  // If no structured blocks matched but body text has keywords, fallback to body text
  if (blocks.length === 0) {
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    if (PRICE_KEYWORDS_REGEX.test(bodyText)) {
      blocks.push(bodyText);
    }
  }

  // De-duplicate matching blocks
  const uniqueBlocks = [...new Set(blocks)];
  const combined = uniqueBlocks.join("\n\n");
  return combined.slice(0, 6000);
}

export async function getPricingText(website: string, gymId?: string): Promise<string> {
  let homeHtml = "";
  let baseOrigin: string;
  try {
    const parsed = new URL(website);
    baseOrigin = parsed.origin;
  } catch {
    await logScrapeAttempt(gymId ?? null, website, false, null, "INVALID_URL");
    return "";
  }

  // 1. Fetch Home Page
  try {
    const res = await safeFetch(website);
    await logScrapeAttempt(gymId ?? null, website, res.ok, res.status, res.ok ? null : "HTTP_ERROR");
    if (res.ok) {
      homeHtml = res.text;
    }
  } catch (err: any) {
    captureError("scraper", err, gymId ? { gym_id: gymId } : {});
    await logScrapeAttempt(gymId ?? null, website, false, null, err?.name || "FETCH_FAILED");
  }

  if (!homeHtml) {
    return "";
  }

  // Extract and save og:image from home page
  const $ = cheerio.load(homeHtml);
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="og:image"]').attr("content");

  if (ogImage && gymId) {
    try {
      const resolvedOg = new URL(ogImage, website).href;
      await adminClient.from("gyms").update({ og_image_url: resolvedOg }).eq("id", gymId);
    } catch {}
  }

  // 2. Discover candidate subpages: up to 2 of /pricing /membership /prices /plans
  const subpageCandidates = new Set<string>();

  // Check <a> links in home page
  $("a[href]").each((_, elem) => {
    const href = $(elem).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, website);
      if (resolved.origin === baseOrigin) {
        const pathLower = resolved.pathname.toLowerCase();
        if (
          pathLower.includes("pricing") ||
          pathLower.includes("membership") ||
          pathLower.includes("prices") ||
          pathLower.includes("plans")
        ) {
          subpageCandidates.add(resolved.href);
        }
      }
    } catch {}
  });

  // Also include standard pricing path candidates if not found in links
  const standardPaths = ["/pricing", "/membership", "/prices", "/plans"];
  for (const p of standardPaths) {
    if (subpageCandidates.size >= 2) break;
    try {
      const u = new URL(p, website).href;
      subpageCandidates.add(u);
    } catch {}
  }

  const pagesToScrape = Array.from(subpageCandidates).slice(0, 2);

  const htmls: string[] = [homeHtml];
  for (const pageUrl of pagesToScrape) {
    try {
      const res = await safeFetch(pageUrl);
      await logScrapeAttempt(gymId ?? null, pageUrl, res.ok, res.status, res.ok ? null : "HTTP_ERROR");
      if (res.ok && res.text) {
        htmls.push(res.text);
      }
    } catch (err: any) {
      captureError("scraper", err, gymId ? { gym_id: gymId } : {});
      await logScrapeAttempt(gymId ?? null, pageUrl, false, null, err?.name || "FETCH_FAILED");
    }
  }

  // Extract blocks around price keywords from all fetched pages
  const textBlocks = htmls.map(extractPriceBlocksFromHtml).filter(Boolean);
  const combined = textBlocks.join("\n\n---\n\n");
  return combined.slice(0, 6000);
}
