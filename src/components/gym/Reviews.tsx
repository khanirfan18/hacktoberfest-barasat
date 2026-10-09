"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Star } from "lucide-react";
import type { GymReview } from "@/lib/queries/gym";
import { submitGymReview } from "@/app/gym/actions";
import { ReviewText } from "./ReviewText";

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function Reviews({
  gymId,
  reviews: initialReviews,
  canWrite,
  ownReview,
}: {
  gymId: string;
  reviews: GymReview[];
  canWrite: boolean;
  ownReview: GymReview | null;
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [rating, setRating] = useState(ownReview?.rating ?? 5);
  const [body, setBody] = useState(ownReview?.body ?? "");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const counts = [5, 4, 3, 2, 1].map((value) => ({
    value,
    count: reviews.filter((review) => review.rating === value).length,
  }));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;
    const before = reviews;
    const optimisticReview: GymReview = {
      id: ownReview?.id ?? `optimistic-${Date.now()}`,
      rating,
      body: body.trim() || null,
      verified: ownReview?.verified ?? false,
      createdAt: new Date().toISOString(),
    };
    setReviews([optimisticReview, ...before.filter((review) => review.id !== ownReview?.id)]);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("gymId", gymId);
    formData.set("rating", String(rating));
    startTransition(async () => {
      const result = await submitGymReview(formData);
      if (!result.success) {
        setReviews(before);
        setMessage(result.message);
        return;
      }
      const savedReview: GymReview = { ...result.review };
      setReviews((items) => [savedReview, ...items.filter((review) => review.id !== ownReview?.id && review.id !== optimisticReview.id)]);
      setMessage("Your review has been saved.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-4">
        <p className="font-display text-3xl text-lime">{reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : "—"}</p>
        <p className="mt-1 text-xs text-white/45">{reviews.length} reviews</p>
        <div className="mt-4 space-y-2">
          {counts.map(({ value, count }) => (
            <div key={value} className="flex items-center gap-2 text-[11px] text-white/50">
              <span className="w-3">{value}</span><Star size={11} className="text-lime" />
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-lime" style={{ width: `${reviews.length ? count / reviews.length * 100 : 0}%` }} /></span>
              <span className="w-4 text-right">{count}</span>
            </div>
          ))}
        </div>
        {canWrite ? (
          <form onSubmit={submit} className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold">{ownReview ? "Update your review" : "Write a review"}</p>
            <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} stars`} onClick={() => setRating(value)} className={value <= rating ? "text-lime" : "text-white/20"}>★</button>
              ))}
            </div>
            <textarea name="body" value={body} onChange={(event) => setBody(event.target.value.slice(0, 600))} maxLength={600} rows={4} placeholder="How was your session?" className="w-full resize-y rounded-xl border border-white/10 bg-noir/70 p-3 text-xs outline-none focus:border-lime/40" />
            <p className="mt-1 text-right font-mono text-[10px] text-white/35">{body.length}/600</p>
            <button disabled={isPending} className="mt-2 w-full rounded-full bg-lime px-4 py-2.5 text-xs font-semibold text-noir disabled:opacity-50">{isPending ? "Saving…" : ownReview ? "Update review" : "Post review"}</button>
            {message && <p role="status" className="mt-2 text-xs text-white/55">{message}</p>}
          </form>
        ) : <Link href="/login" className="mt-5 block border-t border-white/10 pt-4 text-xs text-cyan">Sign in to write a review ↗</Link>}
      </div>

      <div className="space-y-3">
        {reviews.length ? reviews.map((review) => (
          <article key={review.id} className="rounded-[20px] border border-white/[0.08] bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-lime" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}<span className="text-white/15">{"★".repeat(5 - review.rating)}</span></span>
              <time className="font-mono text-[10px] text-white/35" dateTime={review.createdAt}>{formattedDate(review.createdAt)}</time>
            </div>
            {review.verified && <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-cyan/20 px-2 py-1 text-[9px] uppercase tracking-wider text-cyan"><CheckCircle2 size={11} /> Verified visit</span>}
            {review.body && <div className="mt-3"><ReviewText>{review.body}</ReviewText></div>}
          </article>
        )) : (
          <div className="grid min-h-48 place-items-center rounded-[20px] border border-dashed border-white/10 p-6 text-center text-sm text-white/45">No reviews yet. Be the first to share your session.</div>
        )}
      </div>
    </div>
  );
}
