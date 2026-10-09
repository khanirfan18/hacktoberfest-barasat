export default function ExploreLoading() {
  return (
    <div className="animate-pulse space-y-5 py-5" aria-label="Loading gyms">
      <div className="h-9 w-56 rounded-lg bg-white/[0.08]" />
      <div className="h-12 rounded-xl bg-white/[0.05]" />
      <div className="h-16 rounded-[20px] bg-white/[0.05]" />
      <div className="grid gap-4 lg:grid-cols-[55%_minmax(0,1fr)]">
        <div className="hidden h-[calc(100vh-8rem)] rounded-[20px] bg-white/[0.05] lg:block" />
        <div className="space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-64 rounded-[20px] bg-white/[0.05]" />)}
        </div>
      </div>
    </div>
  );
}
