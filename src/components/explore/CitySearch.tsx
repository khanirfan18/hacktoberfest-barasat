"use client";

import { useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ExploreCity } from "@/lib/queries/gyms";

export function CitySearch({
  cities,
  initialSlug = "",
  landing = false,
}: {
  cities: ExploreCity[];
  initialSlug?: string;
  landing?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(cities.find((city) => city.slug === initialSlug)?.name ?? "");
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMemo(
    () => cities.filter((city) => city.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5),
    [cities, query],
  );

  function choose(city: ExploreCity) {
    setQuery(city.name);
    setSelectedSlug(city.slug);
    setIsOpen(false);
  }

  function navigate(slug: string) {
    if (!slug) return;
    if (landing) {
      router.push(`/explore?city=${encodeURIComponent(slug)}`);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("city", slug);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const match = cities.find((city) => city.slug === selectedSlug)
      ?? matches.find((city) => city.name.toLowerCase() === query.trim().toLowerCase());
    if (match) navigate(match.slug);
  }

  return (
    <form className="relative flex min-w-0 flex-1 gap-2" onSubmit={submit}>
      <label className="sr-only" htmlFor={landing ? "landing-city" : "explore-city"}>Search a city</label>
      <input
        id={landing ? "landing-city" : "explore-city"}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedSlug("");
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        placeholder="Which city are you training in?"
        className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm outline-none transition focus:border-lime/50"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={landing ? "landing-city-options" : "explore-city-options"}
        aria-autocomplete="list"
      />
      <button className="shrink-0 rounded-xl bg-lime px-4 text-sm font-semibold text-noir transition hover:bg-lime/90" type="submit">
        {landing ? "Explore" : "Go"}
      </button>
      {isOpen && (
        <div
          id={landing ? "landing-city-options" : "explore-city-options"}
          role="listbox"
          className="absolute left-0 right-12 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#101418] p-1 shadow-2xl"
        >
          {matches.map((city) => (
            <button
              key={city.id}
              type="button"
              role="option"
              aria-selected={selectedSlug === city.slug}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                choose(city);
                if (!landing) navigate(city.slug);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[0.06]"
            >
              <span>{city.name}</span><span className="text-xs text-white/40">{city.country}</span>
            </button>
          ))}
          {query.trim() && matches.length === 0 && (
            <p className="px-3 py-3 text-xs text-white/50">City missing? We&apos;re expanding soon.</p>
          )}
          {!query.trim() && matches.length === 0 && (
            <p className="px-3 py-3 text-xs text-white/50">Search a city to get started.</p>
          )}
        </div>
      )}
    </form>
  );
}
