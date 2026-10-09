"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Dumbbell, LocateFixed, Map, List, Star, X } from "lucide-react";
import { CitySearch } from "@/components/explore/CitySearch";
import { PriceTag } from "@/components/ui-gg/PriceTag";
import type { ExploreCity, ExploreGym } from "@/lib/queries/gyms";
import { formatMoney } from "@/lib/format";
import { copy } from "@/lib/copy";
import { z } from "zod";

const GymMap = dynamic(() => import("./ExploreMap"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[420px] place-items-center bg-white/[0.025] text-sm text-white/45">Loading map…</div>,
});

const EQUIPMENT_FILTERS = [
  ["dumbbells", "Dumbbells"], ["barbells", "Barbells"], ["squat_rack", "Squat rack"],
  ["treadmill", "Treadmill"], ["bench_press", "Bench"], ["cable_machine", "Cable"],
  ["power_rack", "Power rack"], ["kettlebells", "Kettlebells"],
];
const locationResolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("covered"), citySlug: z.string().min(1) }),
  z.object({ status: z.literal("outside_coverage") }),
]);
const ingestResultSchema = z.object({ citySlug: z.string().min(1), gymsAdded: z.number().int().nonnegative() });

function updateParam(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  searchParams: URLSearchParams,
  key: string,
  value: string | null,
) {
  const params = new URLSearchParams(searchParams.toString());
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

function formatHour(hour: number) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, hour)));
}

function GymCard({
  gym,
  selected,
  onHover,
  index,
}: {
  gym: ExploreGym;
  selected: boolean;
  onHover: (id: string | null) => void;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const image = gym.images[0] ?? gym.images[1];
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.045, 0.3) }}
      onMouseEnter={() => onHover(gym.id)}
      onMouseLeave={() => onHover(null)}
      className={`overflow-hidden rounded-[20px] border bg-white/[0.04] transition ${selected ? "border-lime/50" : "border-white/[0.08] hover:border-white/20"}`}
    >
      <Link id={`gym-card-${gym.id}`} href={gym.status === "unclaimed" ? `/claim/${gym.id}` : `/gym/${gym.slug}`} className="block">
        <div
          className="relative h-36 bg-gradient-to-br from-[#222b2c] via-[#181e21] to-[#34203a] sm:h-40"
          style={image ? { backgroundImage: `linear-gradient(0deg,rgba(7,9,11,.5),transparent),url("${image}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
        >
          {!image && <span className="absolute inset-0 grid place-items-center font-display text-4xl text-lime/70">{gym.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>}
          <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${gym.isOpenNow ? "border-lime/30 bg-black/50 text-lime" : "border-white/15 bg-black/50 text-white/60"}`}>
            {gym.isOpenNow ? "Open now" : "Hours vary"}
          </span>
          <div className="absolute right-3 top-3" onClick={(event) => event.preventDefault()}>
            <PriceTag
              amount={gym.priceMinor}
              currency={gym.priceCurrency}
              source={gym.priceMinor === null || gym.priceSource === "none"
                ? undefined
                : gym.priceSource === "owner" ? "Owner" : gym.priceSource === "scraped" ? "Scraped" : "Estimated"}
            />
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-sm sm:text-base">{gym.name}</h2>
              <p className="mt-1 truncate text-xs text-white/45">{gym.address ?? "Address coming soon"}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-lime"><Star size={13} fill="currentColor" /> {gym.rating.toFixed(1)}</span>
          </div>
          <p className="mt-2 text-[11px] text-white/45">{gym.ratingCount} reviews · {gym.verifiedCount} verified</p>
          <div className="mt-3 flex min-h-7 flex-wrap gap-1.5">
            {gym.equipment.map((item) => (
              <span key={item.key} title={item.name} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/60">
                <Dumbbell size={11} className="text-cyan" />{item.name}
              </span>
            ))}
            {gym.equipment.length === 0 && <span className="text-[10px] text-white/35">Equipment details coming soon</span>}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs">
            {gym.status === "claimed" && gym.nextFreeHour !== null
              ? <span className="text-white/65">Next free: <strong className="font-mono text-lime">{formatHour(gym.nextFreeHour)}</strong></span>
              : gym.status === "unclaimed"
                ? <span className="text-white/50">Unclaimed gym</span>
                : <span className="text-white/45">{gym.availabilityChecked ? "No free hour today" : "Check availability"}</span>}
            {gym.status === "unclaimed" ? <span className="font-mono text-[10px] uppercase text-cyan">Claim this gym ↗</span> : <span className="font-mono text-[10px] uppercase text-lime">View gym ↗</span>}
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export function ExploreClient({
  city,
  cities,
  gyms,
  selectedEquipment,
  maxPrice,
  minRating,
  openOnly,
  query,
  sort,
}: {
  city: ExploreCity | null;
  cities: ExploreCity[];
  gyms: ExploreGym[];
  selectedEquipment: string;
  maxPrice: string;
  minRating: string;
  openOnly: boolean;
  query: string;
  sort: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileMap, setMobileMap] = useState(false);
  const [geolocationError, setGeolocationError] = useState("");
  const [outsideCoverage, setOutsideCoverage] = useState<{ lat: number; lng: number } | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [loadingCityGyms, setLoadingCityGyms] = useState(false);
  const queryTimer = useRef<number | null>(null);
  const selectedKeys = selectedEquipment.split(",").filter(Boolean);
  useEffect(() => () => {
    if (queryTimer.current !== null) window.clearTimeout(queryTimer.current);
  }, []);
  const results = useMemo(() => {
    const filtered = gyms.filter((gym) =>
      (!query || `${gym.name} ${gym.address ?? ""}`.toLowerCase().includes(query.toLowerCase()))
      && (!maxPrice || (gym.priceMinor !== null && gym.priceMinor <= Number(maxPrice) * 100))
      && (!minRating || gym.rating >= Number(minRating))
      && (!openOnly || gym.isOpenNow),
    );
    if (sort === "price") filtered.sort((a, b) => (a.priceMinor ?? Infinity) - (b.priceMinor ?? Infinity));
    else if (sort === "near") {
      const latValue = searchParams.get("lat");
      const lngValue = searchParams.get("lng");
      const lat = latValue ? Number(latValue) : null;
      const lng = lngValue ? Number(lngValue) : null;
      if (lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)) {
        const distance = (gym: ExploreGym) => gym.lat === null || gym.lng === null
          ? Infinity
          : Math.hypot(gym.lat - lat, gym.lng - lng);
        filtered.sort((a, b) => distance(a) - distance(b));
      }
    } else filtered.sort((a, b) => b.rating - a.rating);
    return filtered;
  }, [gyms, query, maxPrice, minRating, openOnly, sort, searchParams]);

  function selectEquipment(key: string) {
    const next = selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key];
    updateParam(router, pathname, new URLSearchParams(searchParams.toString()), "eq", next.length ? next.join(",") : null);
  }

  function useLocation() {
    setGeolocationError("");
    setOutsideCoverage(null);
    if (!navigator.geolocation) {
      setGeolocationError(copy.liveCity.locationUnavailable);
      return;
    }
    setResolvingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const location = { lat: Number(coords.latitude.toFixed(2)), lng: Number(coords.longitude.toFixed(2)) };
        try {
          const response = await fetch("/api/geo/resolve", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(location),
          });
          if (!response.ok) throw new Error("resolve");
          const parsed = locationResolutionSchema.safeParse(await response.json());
          if (!parsed.success) throw new Error("resolve");
          if (parsed.data.status === "covered") {
            router.push(`/explore?city=${encodeURIComponent(parsed.data.citySlug)}`);
          } else {
            setOutsideCoverage(location);
          }
        } catch {
          setGeolocationError(copy.liveCity.resolveFailed);
        } finally {
          setResolvingLocation(false);
        }
      },
      () => {
        setResolvingLocation(false);
        setGeolocationError(copy.liveCity.locationPermission);
      },
      { maximumAge: 60_000, timeout: 8_000 },
    );
  }

  async function loadGymsHere() {
    if (!outsideCoverage || loadingCityGyms) return;
    setLoadingCityGyms(true);
    setGeolocationError("");
    try {
      const response = await fetch("/api/geo/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(outsideCoverage),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 429) throw new Error(copy.liveCity.rateLimited);
        throw new Error(copy.liveCity.ingestFailed);
      }
      const parsed = ingestResultSchema.safeParse(payload);
      if (!parsed.success) throw new Error(copy.liveCity.ingestFailed);
      router.push(`/explore?city=${encodeURIComponent(parsed.data.citySlug)}`);
    } catch (error) {
      setGeolocationError(error instanceof Error && error.message !== "Failed to fetch" ? error.message : copy.liveCity.ingestFailed);
      setLoadingCityGyms(false);
    }
  }

  const map = city ? <GymMap
    city={city}
    gyms={results}
    selectedId={selectedId}
    onSelect={(gymId, activate) => {
      setSelectedId(gymId);
      if (activate) document.getElementById(`gym-card-${gymId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }}
  /> : null;
  return (
    <div className="pb-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.24em] text-lime">Explore city</p>
          <h1 className="mt-1 font-display text-xl sm:text-2xl">{city ? `Gyms in ${city.name}` : "Find your training ground"}</h1>
        </div>
        <CitySearch key={city?.slug ?? "missing-city"} cities={cities} initialSlug={city?.slug} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[55%_minmax(0,1fr)]">
        <div className="relative hidden overflow-hidden rounded-[20px] border border-white/10 lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-8rem)]">
          <span className="absolute right-3 top-3 z-[500] rounded-full border border-white/10 bg-noir/85 px-3 py-1.5 text-xs text-white/70">{results.length} gyms</span>
          {map}
        </div>
        <div className="min-w-0">
          <label className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 text-white/50">
            <span className="text-sm" aria-hidden>⌕</span>
            <input
              key={query}
              defaultValue={query}
              onChange={(event) => {
                if (queryTimer.current !== null) window.clearTimeout(queryTimer.current);
                const value = event.target.value.trim();
                queryTimer.current = window.setTimeout(() => {
                  updateParam(router, pathname, new URLSearchParams(window.location.search), "q", value || null);
                }, 250);
              }}
              placeholder="Search gym name or address"
              aria-label="Search gym name or address"
              className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {EQUIPMENT_FILTERS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={selectedKeys.includes(key)} onClick={() => selectEquipment(key)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs transition ${selectedKeys.includes(key) ? "border-lime/50 bg-lime/10 text-lime" : "border-white/10 text-white/60 hover:border-white/25"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mb-5 grid gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-3 sm:grid-cols-2 lg:grid-cols-2">
            <label className="grid gap-1 text-[10px] uppercase tracking-wider text-white/45">
              Max price · {maxPrice ? formatMoney(Number(maxPrice) * 100, city?.currency ?? "INR") : "Any"}
              <input type="range" min="0" max="2000" step="50" value={maxPrice || "2000"}
                onChange={(event) => updateParam(router, pathname, new URLSearchParams(searchParams.toString()), "max", event.target.value === "2000" ? null : event.target.value)}
                className="accent-lime" aria-label="Maximum price in rupees" />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/65">
              <input type="checkbox" checked={openOnly} onChange={(event) => updateParam(router, pathname, new URLSearchParams(searchParams.toString()), "open", event.target.checked ? "1" : null)} className="accent-lime" />
              Open now
            </label>
            <label className="flex items-center gap-2 text-xs text-white/65">
              <span>Rating</span>
              <select value={minRating} onChange={(event) => updateParam(router, pathname, new URLSearchParams(searchParams.toString()), "min", event.target.value || null)} className="min-w-0 rounded-lg border border-white/10 bg-[#101418] px-2 py-2 text-white">
                <option value="">Any</option>{[3, 3.5, 4, 4.5].map((rating) => <option key={rating} value={rating}>{rating}+ stars</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-white/65">
              <span>Sort</span>
              <select value={sort} onChange={(event) => updateParam(router, pathname, new URLSearchParams(searchParams.toString()), "sort", event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-[#101418] px-2 py-2 text-white">
                <option value="rating">Top rated</option><option value="price">Price</option>
              </select>
            </label>
            <button type="button" onClick={useLocation} disabled={resolvingLocation || loadingCityGyms} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan/25 px-3 py-2 text-xs text-cyan hover:bg-cyan/10 disabled:opacity-50">
              <LocateFixed size={14} /> {resolvingLocation ? copy.liveCity.loadingGyms : "Near me"}
            </button>
            {geolocationError && <p role="status" className="text-xs text-magenta sm:col-span-2">{geolocationError}</p>}
            {outsideCoverage && !loadingCityGyms && (
              <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] p-3 sm:col-span-2">
                <p className="mb-3 text-xs text-white/60">{copy.liveCity.outsideCoverage}</p>
                <button type="button" onClick={() => void loadGymsHere()} className="rounded-full border border-lime/30 bg-lime/[0.08] px-4 py-2 text-xs font-semibold text-lime">{copy.liveCity.loadGyms}</button>
              </div>
            )}
            {loadingCityGyms && (
              <div aria-busy="true" aria-label={copy.liveCity.loadingGyms} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.025] p-3 sm:col-span-2">
                <p className="text-xs text-white/55">{copy.liveCity.loadingDescription}</p>
                {[0, 1, 2].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-white/[0.06]" />)}
              </div>
            )}
          </div>
          <section aria-label="Gym results" className="min-w-0">
            <div className="mb-3 flex items-center justify-between text-xs text-white/45">
              <span>{results.length} {results.length === 1 ? "gym" : "gyms"} found</span>
              {sort === "near" && <span className="text-cyan">Sorted by distance</span>}
            </div>
            {results.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {results.map((gym, index) => <GymCard key={gym.id} gym={gym} index={index} selected={selectedId === gym.id} onHover={setSelectedId} />)}
              </div>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-[20px] border border-dashed border-white/15 p-8 text-center">
                <div><div className="mx-auto grid size-12 place-items-center rounded-full bg-white/[0.05] text-lime"><Dumbbell /></div><h2 className="mt-4 font-display text-sm">No gyms match those filters</h2><p className="mt-2 text-sm text-white/50">Try widening your search or choosing another city.</p></div>
              </div>
            )}
          </section>
        </div>
      </div>
      {mobileMap && (
        <div className="fixed inset-0 z-[60] bg-black/65 lg:hidden" onClick={() => setMobileMap(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Gym map"
            className="absolute inset-x-0 bottom-0 h-[78dvh] overflow-hidden rounded-t-[24px] border-t border-white/15 bg-noir shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-display text-sm">Map · {results.length} gyms</span>
              <button type="button" onClick={() => setMobileMap(false)} aria-label="Close map" className="rounded-lg border border-white/10 p-2"><X size={18} /></button>
            </div>
            <div className="h-[calc(100%-52px)]">{map}</div>
            <button type="button" onClick={() => setMobileMap(false)} className="absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-noir shadow-lg">Show {results.length} gyms</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setMobileMap((open) => !open)} className="fixed bottom-20 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-lime/30 bg-[#101418]/95 px-5 py-3 text-sm text-lime shadow-xl backdrop-blur lg:hidden">
        {mobileMap ? <List size={16} /> : <Map size={16} />}{mobileMap ? "List" : "Map"}
      </button>
    </div>
  );
}
