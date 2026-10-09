import Link from "next/link";
import { CitySearch } from "@/components/explore/CitySearch";
import { GlassCard, Pill, SectionTitle, StatTile } from "@/components/ui-gg";
import { getExploreCities, getExploreStats } from "@/lib/queries/gyms";
import { copy } from "@/lib/copy";

export default async function Home() {
  const [cities, stats] = await Promise.all([getExploreCities(), getExploreStats()]);
  return <div className="relative overflow-hidden pb-16 pt-12 sm:pt-24">
    <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
    <Pill>Live in {cities.slice(0, 2).map((city) => city.name).join(" · ") || "more cities soon"}</Pill>
    <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">{copy.hero}</h1>
    <p className="mt-6 max-w-xl text-lg text-white/60">{copy.heroBody}</p>
    <div className="mt-8 max-w-xl">
      <CitySearch cities={cities} landing />
    </div>
    <p className="mt-3 text-xs text-white/40">City missing? We&apos;re expanding soon.</p>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row"><Link href="/signup" className="inline-flex w-fit items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5">List your gym</Link></div>
    <section aria-label="GymGo live stats" className="mt-14 grid grid-cols-1 gap-3 border-y border-white/10 py-5 sm:grid-cols-3">
      <StatTile label="Gyms tracked" value={stats.gymsTracked.toLocaleString("en-IN")} />
      <StatTile label="Prices found" value={stats.pricesFound.toLocaleString("en-IN")} />
      <StatTile label="Bookings made" value={stats.bookingsMade.toLocaleString("en-IN")} />
    </section>
    <div className="mt-8 overflow-hidden py-4 font-mono text-xs uppercase tracking-[0.3em] text-white/40">
      <div className="flex gap-10 whitespace-nowrap">{cities.concat(cities).map((city, index) => <span key={`${city.slug}-${index}`}>● {city.name}</span>)}</div>
    </div>
    <section className="mt-14"><SectionTitle eyebrow="The loop" title="Your routine travels with you." /><div className="grid gap-4 md:grid-cols-3">{copy.steps.map(([number, title, body]) => <GlassCard key={number} className="p-6"><p className="font-mono text-lime">{number}</p><h3 className="mt-12 font-display text-lg">{title}</h3><p className="mt-3 text-sm text-white/50">{body}</p></GlassCard>)}</div></section>
  </div>;
}
