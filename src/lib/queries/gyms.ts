import "server-only";
import { z } from "zod";
import { adminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getLocalDate, getLocalHour, isGymOpenNow } from "@/lib/explore";

export type ExploreCity = {
  id: string;
  name: string;
  slug: string;
  country: string;
  lat: number;
  lng: number;
  timezone: string;
  currency: string;
};

export type ExploreGym = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  images: string[];
  rating: number;
  ratingCount: number;
  verifiedCount: number;
  priceMinor: number | null;
  priceCurrency: string;
  priceSource: "scraped" | "owner" | "estimated" | "none";
  status: "claimed" | "unclaimed";
  openingHours: unknown;
  equipment: Array<{ key: string; name: string; icon: string | null }>;
  isOpenNow: boolean;
  availabilityChecked: boolean;
  nextFreeHour: number | null;
};

export type ExploreStats = {
  gymsTracked: number;
  pricesFound: number;
  bookingsMade: number;
};

const popularEquipment = [
  "dumbbells", "barbells", "squat_rack", "treadmill", "bench_press",
  "cable_machine", "power_rack", "kettlebells",
];

function isSafeImageUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function assertNoError<T>(context: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

export async function getExploreCities(): Promise<ExploreCity[]> {
  const supabase = await createServerClient();
  const result = await supabase
    .from("cities")
    .select("id, name, slug, country, lat, lng, timezone, currency")
    .order("name");
  return assertNoError("Load cities", result);
}

export async function getExploreGyms(
  city: ExploreCity,
  now: Date = new Date(),
  equipmentFilter: string[] = [],
): Promise<ExploreGym[]> {
  const supabase = await createServerClient();
  const gymResult = await supabase
    .from("gyms")
    .select("id, slug, name, address, lat, lng, hero_image_url, og_image_url, opening_hours, price_minor, price_currency, price_source, status, rating_avg, rating_count")
    .eq("city_id", city.id)
    .order("name")
    .limit(60);
  const gyms = assertNoError("Load gyms", gymResult);
  if (gyms.length === 0) return [];

  const ids = gyms.map((gym) => gym.id);
  const [equipmentResult, imagesResult, reviewsResult] = await Promise.all([
    supabase.from("gym_equipment")
      .select("gym_id, equipment_types(key, name, icon)")
      .in("gym_id", ids),
    supabase.from("gym_images").select("gym_id, url, kind").in("gym_id", ids).order("created_at"),
    supabase.from("reviews").select("gym_id, verified").in("gym_id", ids).eq("verified", true),
  ]);
  const equipmentRows = assertNoError("Load gym equipment", equipmentResult);
  const imageRows = assertNoError("Load gym images", imagesResult);
  const verifiedRows = assertNoError("Load verified reviews", reviewsResult);

  const equipmentByGym = new Map<string, ExploreGym["equipment"]>();
  for (const row of equipmentRows) {
    const joined = Array.isArray(row.equipment_types) ? row.equipment_types[0] : row.equipment_types;
    if (!joined) continue;
    const items = equipmentByGym.get(row.gym_id) ?? [];
    items.push({ key: joined.key, name: joined.name, icon: joined.icon });
    equipmentByGym.set(row.gym_id, items);
  }
  const imagesByGym = new Map<string, string[]>();
  for (const row of imageRows) {
    const items = imagesByGym.get(row.gym_id) ?? [];
    if (row.kind === "hero") items.unshift(row.url);
    imagesByGym.set(row.gym_id, items);
  }
  const verifiedByGym = new Map<string, number>();
  for (const row of verifiedRows) verifiedByGym.set(row.gym_id, (verifiedByGym.get(row.gym_id) ?? 0) + 1);

  const claimed = gyms.filter((gym) => gym.status === "claimed").slice(0, 12);
  const availabilityChecked = new Set(claimed.map((gym) => gym.id));
  const availability = await Promise.all(claimed.map(async (gym) => {
    const { data, error } = await supabase.rpc("slot_availability", {
      p_gym: gym.id,
      p_day: getLocalDate(now, city.timezone),
    });
    if (error) throw new Error(`Load slot availability for ${gym.name}: ${error.message}`);
    const slots = z.array(z.object({
      hour: z.number().int().min(0).max(23),
      capacity: z.number().int().nonnegative(),
      booked: z.number().int().nonnegative(),
      open: z.boolean(),
    })).parse(data ?? []);
    const currentHour = getLocalHour(now, city.timezone);
    const next = slots.find((slot) => slot.open && slot.booked < slot.capacity && slot.hour > currentHour);
    return [gym.id, next?.hour ?? null] as const;
  }));
  const nextHourByGym = new Map(availability);

  return gyms.filter((gym) =>
    equipmentFilter.every((key) => equipmentByGym.get(gym.id)?.some((item) => item.key === key)),
  ).map((gym) => {
    const equipment = (equipmentByGym.get(gym.id) ?? [])
      .sort((a, b) => {
        const aIndex = popularEquipment.indexOf(a.key);
        const bIndex = popularEquipment.indexOf(b.key);
        return (aIndex < 0 ? popularEquipment.length : aIndex) - (bIndex < 0 ? popularEquipment.length : bIndex);
      })
      .slice(0, 4);
    const heroImage = imagesByGym.get(gym.id)?.[0];
    return {
      id: gym.id,
      slug: gym.slug,
      name: gym.name,
      address: gym.address,
      lat: gym.lat,
      lng: gym.lng,
      images: [gym.hero_image_url, gym.og_image_url, heroImage].filter(isSafeImageUrl),
      rating: Number(gym.rating_avg),
      ratingCount: gym.rating_count,
      verifiedCount: verifiedByGym.get(gym.id) ?? 0,
      priceMinor: gym.price_minor,
      priceCurrency: gym.price_currency ?? city.currency,
      priceSource: gym.price_source,
      status: gym.status,
      openingHours: gym.opening_hours,
      equipment,
      isOpenNow: isGymOpenNow(gym.opening_hours, city.timezone, now),
      availabilityChecked: availabilityChecked.has(gym.id),
      nextFreeHour: nextHourByGym.get(gym.id) ?? null,
    };
  });
}

export async function getExploreStats(): Promise<ExploreStats> {
  const [gyms, prices, bookings] = await Promise.all([
    adminClient.from("gyms").select("id", { count: "exact", head: true }),
    adminClient.from("gyms").select("id", { count: "exact", head: true }).not("price_minor", "is", null),
    adminClient.from("bookings").select("id", { count: "exact", head: true }).neq("status", "cancelled"),
  ]);
  for (const [name, result] of [["gyms", gyms], ["prices", prices], ["bookings", bookings]] as const) {
    if (result.error) throw new Error(`Load ${name} stats: ${result.error.message}`);
  }
  return {
    gymsTracked: gyms.count ?? 0,
    pricesFound: prices.count ?? 0,
    bookingsMade: bookings.count ?? 0,
  };
}
