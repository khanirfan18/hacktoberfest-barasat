import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Info, MapPin, Star } from "lucide-react";
import { BookingPanel } from "@/components/gym/BookingPanel";
import { EquipmentList } from "@/components/gym/EquipmentList";
import { Gallery } from "@/components/gym/Gallery";
import { GymSummary } from "@/components/gym/GymSummary";
import { OpeningHours } from "@/components/gym/OpeningHours";
import { Reviews } from "@/components/gym/Reviews";
import { GlassCard } from "@/components/ui-gg/GlassCard";
import { Pill } from "@/components/ui-gg/Pill";
import { PriceTag } from "@/components/ui-gg/PriceTag";
import { getGymDetail } from "@/lib/queries/gym";
import { getGymSummary } from "@/lib/gym-summary";
import { createServerClient } from "@/lib/supabase/server";

type RouteParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { slug } = await params;
  const gym = await getGymDetail(slug);
  if (!gym) return { title: "Gym not found | GymGo" };
  const description = gym.description?.slice(0, 160) ?? `See photos, equipment, opening hours, reviews, and session availability at ${gym.name} in ${gym.cityName}.`;
  return {
    title: `${gym.name} | GymGo`,
    description,
    openGraph: {
      title: `${gym.name} | GymGo`,
      description,
      ...(gym.ogImageUrl ? { images: [{ url: gym.ogImageUrl, alt: gym.name }] } : {}),
      type: "website",
    },
  };
}

function priceSourceLabel(source: string): "Scraped" | "Owner" | "Estimated" | undefined {
  if (source === "scraped") return "Scraped";
  if (source === "owner") return "Owner";
  if (source === "estimated") return "Estimated";
  return undefined;
}

function histogram(reviews: Array<{ rating: number }>) {
  return [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: reviews.filter((review) => review.rating === rating).length,
  }));
}

function priceDomain(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export default async function GymPage({ params }: { params: RouteParams }) {
  const { slug } = await params;
  const gym = await getGymDetail(slug);
  if (!gym) notFound();

  const supabase = await createServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Check gym page session: ${userError.message}`);
  let canWriteReview = false;
  if (user) {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error(`Load gym page role: ${profileError.message}`);
    canWriteReview = profile?.role === "user";
  }

  const ownReview = user
    ? gym.reviews.find((review) => review.userId === user.id) ?? null
    : null;
  const publicReviews = gym.reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    body: review.body,
    verified: review.verified,
    createdAt: review.createdAt,
  }));
  const summary = gym.reviews.length >= 3
    ? await getGymSummary(gym.reviews, gym.equipment.map((item) => item.name), gym.openingHours)
    : null;
  const priceDomainName = priceDomain(gym.priceSourceUrl);
  const priceDate = gym.priceScrapedAt
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: gym.cityTimezone }).format(new Date(gym.priceScrapedAt))
    : null;
  const ratingRows = histogram(gym.reviews);

  return (
    <div className="py-5 pb-28 sm:py-8 lg:pb-10">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <header className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="cyan">{gym.cityName}</Pill>
              {gym.status === "claimed" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-lime/25 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-lime"><CheckCircle2 size={12} /> Claimed</span>
              ) : <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white/45">Unclaimed</span>}
              <span className="inline-flex items-center gap-1 text-xs text-white/45"><MapPin size={13} />{gym.address ?? gym.cityName}</span>
            </div>
            <h1 className="mt-4 font-display text-2xl leading-tight sm:text-4xl">{gym.name}</h1>
            {gym.description && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55">{gym.description}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-2"><Star size={20} fill="currentColor" className="text-lime" /><span className="font-display text-2xl">{gym.rating.toFixed(1)}</span><span className="text-xs text-white/45">({gym.ratingCount})</span></div>
              <div className="grid grid-cols-5 gap-2">
                {ratingRows.map(({ rating, count }) => (
                  <div key={rating} className="flex items-center gap-1 text-[10px] text-white/45" title={`${count} ${count === 1 ? "review" : "reviews"} at ${rating} stars`}>
                    <span>{rating}★</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-lime" style={{ width: `${gym.reviews.length ? count / gym.reviews.length * 100 : 0}%` }} /></span>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-white/45">{gym.verifiedCount} verified visits</p>
            {gym.status === "unclaimed" && (
              <div className="mt-5">
                {user
                  ? <Link href={`/claim/${gym.id}`} id="claim-gym" className="inline-flex rounded-full border border-lime/30 px-4 py-2.5 text-xs font-semibold text-lime transition hover:bg-lime/10">Claim this gym ↗</Link>
                  : <Link href="/login" className="inline-flex rounded-full border border-white/15 px-4 py-2.5 text-xs text-white/65">Sign in to claim this gym</Link>}
              </div>
            )}
          </header>

          <Gallery images={gym.images} name={gym.name} fallbackUrl={gym.ogImageUrl} website={gym.website} />

          <GlassCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cyan">The setup</p><h2 className="mt-1 font-display text-base">Equipment</h2></div>
              <span className="font-mono text-xs text-white/40">{gym.equipment.length} items</span>
            </div>
            <EquipmentList equipment={gym.equipment} claimHref={gym.status === "unclaimed" ? "#claim-gym" : undefined} />
          </GlassCard>

          <OpeningHours openingHours={gym.openingHours} timezone={gym.cityTimezone} estimated={gym.hoursEstimated} />

          <GymSummary summary={summary} />

          <GlassCard className="p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-cyan">Member notes</p><h2 className="mt-1 font-display text-base">Reviews</h2></div>
              <span className="text-xs text-white/40">{gym.reviews.length} total</span>
            </div>
            <Reviews gymId={gym.id} reviews={publicReviews} canWrite={canWriteReview} ownReview={ownReview ? { id: ownReview.id, rating: ownReview.rating, body: ownReview.body, verified: ownReview.verified, createdAt: ownReview.createdAt } : null} />
          </GlassCard>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-white/40">1-hour session</p><div className="mt-2">{gym.priceMinor !== null && gym.priceSource !== "none" ? <PriceTag amount={gym.priceMinor} currency={gym.priceCurrency ?? gym.cityCurrency} source={priceSourceLabel(gym.priceSource)} /> : <p className="font-display text-xl">Price not listed</p>}</div></div>
            </div>
            {gym.priceSource === "scraped" && gym.priceMinor !== null ? (
              <div className="mt-4 space-y-2 text-xs text-white/45">
                <p>Scraped from {priceDomainName ?? "gym website"}{priceDate ? ` on ${priceDate}` : ""}</p>
                {gym.priceSourceUrl && <a href={gym.priceSourceUrl} target="_blank" rel="noreferrer" className="text-cyan underline underline-offset-4">View source ↗</a>}
                {gym.priceEvidence && <p className="flex items-start gap-2"><Info size={14} className="mt-0.5 shrink-0 text-cyan" /><span title={gym.priceEvidence} className="cursor-help">Evidence quote <span className="text-cyan underline decoration-dotted underline-offset-4">ⓘ</span></span></p>}
              </div>
            ) : gym.priceSource === "owner" ? <p className="mt-3 text-xs text-white/45">Set by the gym</p>
              : gym.priceMinor === null || gym.priceSource === "none" ? null
                : <p className="mt-3 text-xs text-white/45">Estimated price</p>}
          </GlassCard>
          <BookingPanel gymId={gym.id} gymName={gym.name} timezone={gym.cityTimezone} priceMinor={gym.priceMinor} currency={gym.priceCurrency ?? gym.cityCurrency} claimed={gym.status === "claimed"} claimHref={`/claim/${gym.id}`} signedIn={Boolean(user)} />
        </div>
      </div>
    </div>
  );
}
