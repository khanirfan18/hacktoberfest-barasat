import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const DEFAULT_HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["06:00", "22:00"]]])
);

function parseOpeningHours(tag?: string): { hours: Record<string, string[][]>; estimated: boolean } {
  if (!tag || typeof tag !== "string") {
    return { hours: DEFAULT_HOURS, estimated: true };
  }

  const clean = tag.trim();

  // 24/7 check
  if (clean === "24/7") {
    const allDay = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [["00:00", "23:59"]]])
    );
    return { hours: allDay, estimated: false };
  }

  // Simple time range: HH:MM-HH:MM or HH:MM - HH:MM
  const simpleMatch = clean.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (simpleMatch) {
    const [, start, end] = simpleMatch;
    const pad = (s: string) => (s.length === 4 ? `0${s}` : s);
    const daily = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[pad(start), pad(end)]]])
    );
    return { hours: daily, estimated: false };
  }

  // Simple Mo-Su or Mo-Sa prefix with HH:MM-HH:MM
  const moSuMatch = clean.match(/^(?:Mo-Su|Mo-Sa)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i);
  if (moSuMatch) {
    const [, start, end] = moSuMatch;
    const pad = (s: string) => (s.length === 4 ? `0${s}` : s);
    const daily = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, [[pad(start), pad(end)]]])
    );
    return { hours: daily, estimated: false };
  }

  // Fallback default
  return { hours: DEFAULT_HOURS, estimated: true };
}

function buildAddress(tags: Record<string, string> = {}, cityName: string): string {
  const parts: string[] = [];
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  if (tags["addr:street"]) parts.push(tags["addr:street"]);
  if (tags["addr:suburb"]) parts.push(tags["addr:suburb"]);
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (parts.length > 0) {
    return parts.join(", ");
  }
  const name = tags.name || "Gym";
  return `${name}, ${cityName}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOverpassWithRetries(query: string, contact: string): Promise<any> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": `GymGoBot/0.1 (+${contact})`,
          },
          body: "data=" + encodeURIComponent(query),
        });

        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        lastError = err;
      }
    }
    // Rate limit wait before retry
    await sleep(2000);
  }
  throw lastError ?? new Error("Failed to query Overpass API after retries");
}

async function main() {
  const cityName = process.argv[2];
  if (!cityName) {
    console.error("Usage: pnpm ingest '<City>'");
    process.exit(1);
  }

  const supabase = getAdminClient();
  const contact = process.env.SCRAPER_CONTACT || "contact@gymgo.demo";

  // 1. Lookup city in DB
  let { data: city, error: cityError } = await supabase
    .from("cities")
    .select("*")
    .ilike("name", cityName)
    .maybeSingle();

  if (!city) {
    const slug = slugify(cityName);
    const { data: bySlug } = await supabase.from("cities").select("*").eq("slug", slug).maybeSingle();
    city = bySlug;
  }

  if (!city) {
    console.error(`City "${cityName}" not found in database.`);
    process.exit(1);
  }

  console.log(`Ingesting gyms for ${city.name} (${city.slug})...`);

  // 2. Cache management in .cache/
  const cacheDir = path.join(process.cwd(), ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, `overpass_${city.slug}.json`);

  let rawData: { elements: OverpassElement[] };

  if (fs.existsSync(cacheFile)) {
    console.log(`Loading cached Overpass response from ${cacheFile}`);
    rawData = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  } else {
    // 3. Nominatim geocode (1 req/s)
    await sleep(1000);
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      city.name
    )}&format=json&limit=1`;
    const nomRes = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": `GymGo/0.1 + ${contact}`,
      },
    });

    if (!nomRes.ok) {
      throw new Error(`Nominatim geocoding failed with status ${nomRes.status}`);
    }

    const nomData = await nomRes.json();
    let south: string, north: string, west: string, east: string;

    if (nomData && nomData[0]?.boundingbox) {
      [south, north, west, east] = nomData[0].boundingbox;
    } else {
      // Fallback bounding box around city coordinates
      south = (city.lat - 0.15).toFixed(6);
      north = (city.lat + 0.15).toFixed(6);
      west = (city.lng - 0.15).toFixed(6);
      east = (city.lng + 0.15).toFixed(6);
    }

    // 4. Overpass query
    const query = `[out:json][timeout:30];(node["leisure"~"^(fitness_centre|sports_centre)$"]["name"](${south},${west},${north},${east});way["leisure"~"^(fitness_centre|sports_centre)$"]["name"](${south},${west},${north},${east}););out center tags;`;

    console.log(`Querying Overpass for bbox (${south}, ${west}, ${north}, ${east})...`);
    rawData = await fetchOverpassWithRetries(query, contact);
    fs.writeFileSync(cacheFile, JSON.stringify(rawData, null, 2), "utf-8");
    console.log(`Saved Overpass response to ${cacheFile}`);
  }

  // Filter named elements and cap 60 per city, avoiding bbox overlap stealing across cities
  let candidateElements = (rawData.elements || []).filter((e) => e.tags && e.tags.name);

  if (city.slug === "kolkata") {
    const barasatFile = path.join(cacheDir, "overpass_barasat.json");
    const barrackporeFile = path.join(cacheDir, "overpass_barrackpore.json");
    const excludedIds = new Set<number>();
    if (fs.existsSync(barasatFile)) {
      const bData = JSON.parse(fs.readFileSync(barasatFile, "utf-8"));
      (bData.elements || []).forEach((e: any) => excludedIds.add(e.id));
    }
    if (fs.existsSync(barrackporeFile)) {
      const bData = JSON.parse(fs.readFileSync(barrackporeFile, "utf-8"));
      (bData.elements || []).forEach((e: any) => excludedIds.add(e.id));
    }
    candidateElements = candidateElements.filter((e) => !excludedIds.has(e.id));
  } else if (city.slug === "barasat") {
    const barrackporeFile = path.join(cacheDir, "overpass_barrackpore.json");
    if (fs.existsSync(barrackporeFile)) {
      const bData = JSON.parse(fs.readFileSync(barrackporeFile, "utf-8"));
      const excludedIds = new Set<number>();
      (bData.elements || []).forEach((e: any) => excludedIds.add(e.id));
      candidateElements = candidateElements.filter((e) => !excludedIds.has(e.id));
    }
  }

  const elements = candidateElements.slice(0, 60);
  console.log(`Found ${candidateElements.length} named elements for ${city.name}, capping at ${elements.length}.`);

  // Fetch existing gyms to preserve slugs and avoid collisions
  const { data: existingGyms } = await supabase.from("gyms").select("id, slug, osm_id");
  const osmToExisting = new Map<string, { id: string; slug: string }>();
  const usedSlugs = new Set<string>();

  for (const g of existingGyms || []) {
    usedSlugs.add(g.slug);
    if (g.osm_id) {
      osmToExisting.set(g.osm_id, { id: g.id, slug: g.slug });
    }
  }

  const upsertRows = [];
  for (const el of elements) {
    const osmId = `${el.type}/${el.id}`;
    const name = el.tags!.name.trim();

    let slug: string;
    const existing = osmToExisting.get(osmId);
    if (existing) {
      slug = existing.slug;
    } else {
      const baseSlug = slugify(name) || `gym-${el.id}`;
      slug = baseSlug;
      let counter = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      usedSlugs.add(slug);
    }

    const website = el.tags!.website || el.tags!["contact:website"] || el.tags!.url || null;
    const phone = el.tags!.phone || el.tags!["contact:phone"] || null;
    const address = buildAddress(el.tags, city.name);
    const { hours, estimated } = parseOpeningHours(el.tags!.opening_hours);

    const lat = el.type === "node" ? el.lat : el.center?.lat ?? city.lat;
    const lng = el.type === "node" ? el.lon : el.center?.lon ?? city.lng;

    upsertRows.push({
      osm_id: osmId,
      slug,
      city_id: city.id,
      name,
      address,
      lat,
      lng,
      website,
      phone,
      opening_hours: hours,
      hours_estimated: estimated,
      capacity_per_hour: 10,
    });
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from("gyms")
      .upsert(upsertRows, { onConflict: "osm_id" });

    if (upsertError) {
      console.error("Upsert failed:", upsertError.message);
      process.exit(1);
    }
  }

  console.log(`Ingest complete for ${city.name}: ${upsertRows.length} gyms upserted.`);
}

main().catch((err) => {
  console.error("Ingest failed:", err);
  process.exit(1);
});
