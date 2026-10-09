export function RatingStars({ rating }: { rating: number }) {
  return <span className="text-lime" aria-label={`${rating} out of 5 stars`}>{"★".repeat(Math.round(rating))}<span className="text-white/20">{"★".repeat(5 - Math.round(rating))}</span></span>;
}
