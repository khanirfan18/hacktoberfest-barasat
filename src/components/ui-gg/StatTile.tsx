import { GlassCard } from "./GlassCard";
export function StatTile({ label, value }: { label: string; value: string }) {
  return <GlassCard className="p-4"><p className="font-mono text-[10px] uppercase tracking-widest text-white/40">{label}</p><p className="mt-2 font-display text-xl text-lime">{value}</p></GlassCard>;
}
