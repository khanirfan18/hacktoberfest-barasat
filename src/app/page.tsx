import Link from "next/link";
import { copy } from "@/lib/copy";
import { GlassCard, NeonButton, Pill, SectionTitle } from "@/components/ui-gg";

export default function Home() {
  return <div className="relative overflow-hidden pb-16 pt-12 sm:pt-24">
    <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-lime/10 blur-3xl" />
    <Pill>Live in {copy.cities[0]}</Pill>
    <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">{copy.hero}</h1>
    <p className="mt-6 max-w-xl text-lg text-white/60">{copy.heroBody}</p>
    <div className="mt-10 flex flex-col gap-3 sm:flex-row"><Link href="/explore"><NeonButton>Find my gym <span aria-hidden>↗</span></NeonButton></Link><Link href="/signup"><NeonButton variant="ghost">List your gym</NeonButton></Link></div>
    <div className="mt-16 overflow-hidden border-y border-white/10 py-4 font-mono text-xs uppercase tracking-[0.3em] text-white/40"><div className="flex gap-10 whitespace-nowrap">{copy.cities.concat(copy.cities).map((city, index) => <span key={`${city}-${index}`}>● {city}</span>)}</div></div>
    <section className="mt-20"><SectionTitle eyebrow="The loop" title="Your routine travels with you." /><div className="grid gap-4 md:grid-cols-3">{copy.steps.map(([number, title, body]) => <GlassCard key={number} className="p-6"><p className="font-mono text-lime">{number}</p><h3 className="mt-12 font-display text-lg">{title}</h3><p className="mt-3 text-sm text-white/50">{body}</p></GlassCard>)}</div></section>
  </div>;
}
