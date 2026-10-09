import { GlassCard } from "@/components/ui-gg/GlassCard";

export default function GymLoading() {
  return (
    <div className="py-5 pb-28 sm:py-8 lg:pb-10" aria-label="Loading gym details">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="h-52 animate-pulse rounded-[20px] border border-white/[0.08] bg-white/[0.04]" />
          <div className="h-64 animate-pulse rounded-[20px] bg-white/[0.04] sm:h-[360px]" />
          <GlassCard className="space-y-4 p-6">
            <div className="h-5 w-36 animate-pulse rounded bg-white/10" />
            <div className="h-28 animate-pulse rounded-xl bg-white/[0.05]" />
          </GlassCard>
          <GlassCard className="space-y-3 p-6">
            <div className="h-5 w-28 animate-pulse rounded bg-white/10" />
            <div className="h-24 animate-pulse rounded-xl bg-white/[0.05]" />
          </GlassCard>
        </div>
        <GlassCard className="hidden h-64 animate-pulse p-5 lg:block" />
      </div>
    </div>
  );
}
