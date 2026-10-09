import { Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui-gg/GlassCard";
import type { GymSummary as GymSummaryType } from "@/lib/gym-summary";

export function GymSummary({ summary }: { summary: GymSummaryType | null }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-cyan" />
        <h2 className="font-display text-sm">Gemma take</h2>
        <span className="rounded-full border border-cyan/25 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-cyan">AI summary</span>
      </div>
      {summary ? (
        <div className="mt-4 space-y-3 text-sm text-white/65">
          <p>{summary.vibe}</p>
          {summary.pros.length > 0 && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-lime">What people like</p><ul className="list-inside list-disc space-y-1">{summary.pros.map((pro, index) => <li key={index}>{pro}</li>)}</ul></div>}
          {summary.cons.length > 0 && <div><p className="mb-1 text-[10px] uppercase tracking-wider text-magenta">Could be better</p><ul className="list-inside list-disc space-y-1">{summary.cons.map((con, index) => <li key={index}>{con}</li>)}</ul></div>}
          <p className="text-xs text-white/50"><span className="text-cyan">Best time:</span> {summary.best_time}</p>
        </div>
      ) : <p className="mt-4 text-sm text-white/45">Not enough reviews yet.</p>}
    </GlassCard>
  );
}
