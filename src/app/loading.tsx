export default function HomeLoading() {
  return (
    <div className="animate-pulse space-y-6 py-16" aria-label="Loading GymGo">
      <div className="h-7 w-40 rounded-full bg-white/[0.08]" />
      <div className="h-24 max-w-3xl rounded-xl bg-white/[0.06]" />
      <div className="h-12 max-w-xl rounded-xl bg-white/[0.05]" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-[20px] bg-white/[0.05]" />)}
      </div>
    </div>
  );
}
