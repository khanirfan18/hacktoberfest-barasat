import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 20;

const coordinateSchema = z.number()
  .min(-180)
  .max(180)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7);
const requestSchema = z.object({
  lat: coordinateSchema.min(-90).max(90),
  lng: coordinateSchema,
});
const nominatimSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string().max(500),
  address: z.object({
    city: z.string().optional(),
    town: z.string().optional(),
    village: z.string().optional(),
    municipality: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});
const overpassSchema = z.object({
  elements: z.array(z.object({
    type: z.enum(["node", "way", "relation"]),
    id: z.number().int().positive(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).optional(),
    tags: z.record(z.string(), z.string()).optional(),
  })),
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-").slice(0, 70).replace(/-+$/g, "");
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function openingHours(value: string | undefined) {
  if (!value) return { hours: {}, estimated: true };
  const match = value.match(/^(?:Mo-Su\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/i);
  if (!match) return { hours: {}, estimated: true };
  const pad = (time: string) => time.length === 4 ? `0${time}` : time;
  const hours = Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [[pad(match[1]), pad(match[2])]]]),
  );
  return { hours, estimated: false };
}

function addressFor(tags: Record<string, string>, cityName: string) {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]]
    .filter((part): part is string => Boolean(part))
    .slice(0, 4);
  return (parts.length ? parts.join(", ") : `${tags.name || "Gym"}, ${cityName}`).slice(0, 300);
}

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseError("Invalid location.", 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return responseError("Invalid location.", 400);

  const lat = Math.round(parsed.data.lat * 100) / 100;
  const lng = Math.round(parsed.data.lng * 100) / 100;
  const deadline = AbortSignal.timeout(20_000);
  const contact = process.env.SCRAPER_CONTACT || "contact@gymgo.demo";

  try {
    const reverseUrl = new URL("https://nominatim.openstreetmap.org/reverse");
    reverseUrl.searchParams.set("format", "jsonv2");
    reverseUrl.searchParams.set("zoom", "10");
    reverseUrl.searchParams.set("addressdetails", "1");
    reverseUrl.searchParams.set("lat", String(lat));
    reverseUrl.searchParams.set("lon", String(lng));
    const reverseResponse = await fetch(reverseUrl, {
      headers: { "User-Agent": `GymGo/0.1 (+${contact})` },
      signal: deadline,
      cache: "no-store",
    });
    if (!reverseResponse.ok) return responseError("Could not identify the nearest city.", 502);
    const reverseParsed = nominatimSchema.safeParse(await reverseResponse.json());
    if (!reverseParsed.success) return responseError("Could not identify the nearest city.", 422);

    const reverse = reverseParsed.data;
    const address = reverse.address;
    const cityName = (address?.city || address?.town || address?.village || address?.municipality || address?.county || address?.state || "").trim().slice(0, 100);
    if (!cityName) return responseError("Could not identify a city for this location.", 422);
    const slug = slugify(cityName);
    if (!slug) return responseError("Could not identify a city for this location.", 422);
    const centerLat = Number(reverse.lat);
    const centerLng = Number(reverse.lon);
    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return responseError("Could not identify the nearest city.", 422);

    const { data: cities, error: citiesError } = await adminClient
      .from("cities")
      .select("id, name, slug, lat, lng, timezone")
      .limit(1000);
    if (citiesError) return responseError("Could not load city settings.", 500);
    const nearest = (cities ?? [])
      .map((city) => ({ city, distance: distanceKm(lat, lng, city.lat, city.lng) }))
      .sort((a, b) => a.distance - b.distance)[0]?.city;
    const timezone = nearest?.timezone ?? "Asia/Kolkata";
    const existingCity = cities?.find((city) => city.slug === slug);

    const { error: reserveError } = await adminClient.rpc("reserve_geo_ingest", { p_city_slug: slug });
    if (reserveError) {
      if (reserveError.message.includes("CITY_INGEST_LIMIT")) return responseError("Gyms in this city were loaded within the last 24 hours.", 429);
      if (reserveError.message.includes("GLOBAL_INGEST_LIMIT")) return responseError("Live city searches are busy. Please try again in an hour.", 429);
      return responseError("Could not start a live city search.", 500);
    }

    let cityId = existingCity?.id;
    if (!cityId) {
      const { data: insertedCity, error: insertCityError } = await adminClient
        .from("cities")
        .insert({
          name: cityName,
          country: address?.country?.slice(0, 100) || "India",
          lat: centerLat,
          lng: centerLng,
          timezone,
          currency: "INR",
          slug,
        })
        .select("id")
        .single();
      if (insertCityError || !insertedCity) return responseError("Could not create this city.", 500);
      cityId = insertedCity.id;
    }

    const query = `[out:json][timeout:17];(nwr["leisure"~"^(fitness_centre|sports_centre)$"]["name"](around:10000,${lat},${lng});nwr["sport"~"^(fitness|gym)$"]["name"](around:10000,${lat},${lng}););out center tags 120;`;
    const overpassResponse = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `GymGo/0.1 (+${contact})`,
      },
      body: new URLSearchParams({ data: query }),
      signal: deadline,
      cache: "no-store",
    });
    if (!overpassResponse.ok) return responseError("Could not fetch gyms for this city.", 502);
    const overpass = overpassSchema.safeParse(await overpassResponse.json());
    if (!overpass.success) return responseError("Gym data returned by the map service was invalid.", 502);

    const candidates = overpass.data.elements
      .filter((element) => element.tags?.name?.trim())
      .map((element) => ({
        element,
        lat: element.type === "node" ? element.lat : element.center?.lat,
        lng: element.type === "node" ? element.lon : element.center?.lon,
      }))
      .filter((entry): entry is typeof entry & { lat: number; lng: number } => typeof entry.lat === "number" && typeof entry.lng === "number")
      .filter((entry) => distanceKm(lat, lng, entry.lat, entry.lng) <= 10)
      .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))
      .slice(0, 80);
    const osmIds = candidates.map(({ element }) => `${element.type}/${element.id}`);
    const { data: existingGyms, error: existingGymsError } = osmIds.length
      ? await adminClient.from("gyms").select("osm_id").in("osm_id", osmIds)
      : { data: [], error: null };
    if (existingGymsError) return responseError("Could not check existing gyms.", 500);
    const existingOsmIds = new Set((existingGyms ?? []).map((gym) => gym.osm_id));

    const { data: existingSlugs, error: existingSlugsError } = await adminClient.from("gyms").select("slug").limit(10000);
    if (existingSlugsError) return responseError("Could not prepare gym listings.", 500);
    const usedSlugs = new Set((existingSlugs ?? []).map((gym) => gym.slug));
    const rows = [];
    for (const entry of candidates) {
      const element = entry.element;
      const osmId = `${element.type}/${element.id}`;
      if (existingOsmIds.has(osmId)) continue;
      const tags = element.tags ?? {};
      const name = tags.name?.trim().slice(0, 160);
      if (!name) continue;
      const baseSlug = `${slug}-${slugify(name) || `gym-${element.id}`}`.slice(0, 100).replace(/-+$/g, "");
      let gymSlug = baseSlug;
      let counter = 2;
      while (usedSlugs.has(gymSlug)) {
        const suffix = `-${counter++}`;
        gymSlug = `${baseSlug.slice(0, 100 - suffix.length)}${suffix}`;
      }
      usedSlugs.add(gymSlug);
      const hours = openingHours(tags.opening_hours);
      rows.push({
        osm_id: osmId,
        slug: gymSlug,
        city_id: cityId,
        name,
        address: addressFor(tags, cityName),
        lat: entry.lat,
        lng: entry.lng,
        website: tags.website?.slice(0, 500) ?? tags["contact:website"]?.slice(0, 500) ?? null,
        phone: tags.phone?.slice(0, 80) ?? tags["contact:phone"]?.slice(0, 80) ?? null,
        opening_hours: hours.hours,
        hours_estimated: hours.estimated,
        capacity_per_hour: 10,
        owner_id: null,
        status: "unclaimed",
        price_source: "none",
      });
    }
    if (rows.length) {
      const { error: insertGymsError } = await adminClient.from("gyms").upsert(rows, { onConflict: "osm_id", ignoreDuplicates: true });
      if (insertGymsError) return responseError("Could not save gyms for this city.", 500);
    }
    return NextResponse.json({ citySlug: slug, gymsAdded: rows.length });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return responseError("Live city search timed out. Please try again later.", 504);
    return responseError("Live city search failed. Please try again later.", 502);
  }
}
