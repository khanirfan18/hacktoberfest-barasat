import { ExploreClient } from "@/components/explore/ExploreClient";
import { getExploreCities, getExploreGyms } from "@/lib/queries/gyms";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function paramValue(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function finiteNumber(value: string): number | null {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const cities = await getExploreCities();
  const requestedSlug = paramValue(params, "city");
  if (!requestedSlug && cities.length > 0) {
    redirect(`/explore?city=${encodeURIComponent(cities.find((item) => item.slug === "barasat")?.slug ?? cities[0].slug)}`);
  }
  const city = requestedSlug
    ? cities.find((item) => item.slug === requestedSlug) ?? null
    : cities.find((item) => item.slug === "barasat") ?? cities[0] ?? null;
  const query = paramValue(params, "q").trim().slice(0, 100);
  const equipment = paramValue(params, "eq").split(",").filter(Boolean).slice(0, 8);
  const allGyms = city ? await getExploreGyms(city, new Date(), equipment) : [];
  const max = finiteNumber(paramValue(params, "max"));
  const min = finiteNumber(paramValue(params, "min"));
  const openOnly = paramValue(params, "open") === "1";
  const sortParam = paramValue(params, "sort");
  const sort = sortParam === "price" || sortParam === "near" ? sortParam : "rating";
  const lat = finiteNumber(paramValue(params, "lat"));
  const lng = finiteNumber(paramValue(params, "lng"));
  const gyms = allGyms.filter((gym) =>
    (!query || `${gym.name} ${gym.address ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    && (max === null || (gym.priceMinor !== null && gym.priceMinor <= max * 100))
    && (min === null || gym.rating >= min)
    && (!openOnly || gym.isOpenNow),
  );
  if (sort === "price") gyms.sort((a, b) => (a.priceMinor ?? Infinity) - (b.priceMinor ?? Infinity));
  else if (sort === "near" && lat !== null && lng !== null) {
    const distance = (gym: (typeof gyms)[number]) => gym.lat === null || gym.lng === null
      ? Infinity
      : Math.hypot(gym.lat - lat, gym.lng - lng);
    gyms.sort((a, b) => distance(a) - distance(b));
  } else gyms.sort((a, b) => b.rating - a.rating);

  return (
    <ExploreClient
      city={city}
      cities={cities}
      gyms={gyms}
      selectedEquipment={equipment.join(",")}
      maxPrice={max === null ? "" : String(max)}
      minRating={min === null ? "" : String(min)}
      openOnly={openOnly}
      query={query}
      sort={sort}
    />
  );
}
