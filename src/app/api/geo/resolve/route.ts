import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  const parsed = coordinatesSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  const lat = Math.round(parsed.data.lat * 100) / 100;
  const lng = Math.round(parsed.data.lng * 100) / 100;

  const { data: cities, error } = await adminClient
    .from("cities")
    .select("slug, lat, lng")
    .limit(1000);
  if (error) return NextResponse.json({ error: "Could not resolve location" }, { status: 500 });
  const nearest = (cities ?? [])
    .map((city) => ({ slug: city.slug, distance: distanceKm(lat, lng, city.lat, city.lng) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (nearest && nearest.distance <= 10) {
    return NextResponse.json({ status: "covered", citySlug: nearest.slug });
  }
  return NextResponse.json({ status: "outside_coverage" });
}
