import "server-only";
import { createServerClient } from "@/lib/supabase/server";

export type GymReview = {
  id: string;
  rating: number;
  body: string | null;
  verified: boolean;
  createdAt: string;
};

type GymReviewWithUser = GymReview & { userId: string };

export type GymDetail = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  cityName: string;
  cityTimezone: string;
  cityCurrency: string;
  rating: number;
  ratingCount: number;
  verifiedCount: number;
  status: "claimed" | "unclaimed";
  website: string | null;
  ogImageUrl: string | null;
  description: string | null;
  images: Array<{ id: string; url: string; caption: string | null }>;
  equipment: Array<{
    key: string;
    name: string;
    category: string;
    icon: string | null;
    quantity: number;
    source: string;
    confirmed: boolean;
  }>;
  priceMinor: number | null;
  priceCurrency: string | null;
  priceSource: "scraped" | "owner" | "estimated" | "none";
  priceScrapedAt: string | null;
  priceSourceUrl: string | null;
  priceEvidence: string | null;
  openingHours: unknown;
  hoursEstimated: boolean;
  reviews: GymReviewWithUser[];
};

function assertNoError<T>(context: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

function isHttps(value: string | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function getGymDetail(slug: string): Promise<GymDetail | null> {
  const supabase = await createServerClient();
  const gymResult = await supabase
    .from("gyms")
    .select("id, slug, name, address, website, og_image_url, description, opening_hours, hours_estimated, price_minor, price_currency, price_source, price_scraped_at, price_source_url, price_evidence, status, rating_avg, rating_count, cities(name, timezone, currency)")
    .eq("slug", slug)
    .maybeSingle();
  if (gymResult.error) throw new Error(`Load gym: ${gymResult.error.message}`);
  if (!gymResult.data) return null;
  const gym = gymResult.data;
  const city = Array.isArray(gym.cities) ? gym.cities[0] : gym.cities;
  if (!city) throw new Error("Load gym city: no related city returned");

  const [imagesResult, equipmentResult, reviewsResult] = await Promise.all([
    supabase.from("gym_images").select("id, url, caption, created_at").eq("gym_id", gym.id).order("created_at").limit(24),
    supabase.from("gym_equipment")
      .select("quantity, source, confirmed, equipment_types(key, name, category, icon)")
      .eq("gym_id", gym.id)
      .order("created_at"),
    supabase.from("reviews").select("id, user_id, rating, body, verified, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
  ]);
  const imageRows = assertNoError("Load gym images", imagesResult);
  const equipmentRows = assertNoError("Load gym equipment", equipmentResult);
  const reviewRows = assertNoError("Load gym reviews", reviewsResult);

  const images = imageRows
    .filter((image) => isHttps(image.url))
    .map(({ id, url, caption }) => ({ id, url, caption: caption?.slice(0, 200) ?? null }));
  const equipment = equipmentRows.flatMap((row) => {
    if (row.source === "ai" && !row.confirmed) return [];
    const type = Array.isArray(row.equipment_types) ? row.equipment_types[0] : row.equipment_types;
    if (!type) return [];
    return [{
      key: type.key,
      name: type.name.slice(0, 120),
      category: type.category,
      icon: type.icon,
      quantity: row.quantity,
      source: row.source,
      confirmed: row.confirmed,
    }];
  });
  const reviews = reviewRows.map((review) => ({
    id: review.id,
    userId: review.user_id,
    rating: review.rating,
    body: review.body?.slice(0, 600) ?? null,
    verified: review.verified,
    createdAt: review.created_at,
  }));

  return {
    id: gym.id,
    slug: gym.slug,
    name: gym.name.slice(0, 160),
    address: gym.address?.slice(0, 300) ?? null,
    cityName: city.name.slice(0, 100),
    cityTimezone: city.timezone,
    cityCurrency: city.currency,
    rating: Number(gym.rating_avg),
    ratingCount: gym.rating_count,
    verifiedCount: reviews.filter((review) => review.verified).length,
    status: gym.status,
    website: isHttps(gym.website) ? gym.website : null,
    ogImageUrl: isHttps(gym.og_image_url) ? gym.og_image_url : null,
    description: gym.description?.slice(0, 1200) ?? null,
    images,
    equipment,
    priceMinor: gym.price_minor,
    priceCurrency: gym.price_currency,
    priceSource: gym.price_source,
    priceScrapedAt: gym.price_scraped_at,
    priceSourceUrl: isHttps(gym.price_source_url) ? gym.price_source_url : null,
    priceEvidence: gym.price_evidence?.slice(0, 400) ?? null,
    openingHours: gym.opening_hours,
    hoursEstimated: gym.hours_estimated,
    reviews,
  };
}
