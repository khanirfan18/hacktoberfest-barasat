import { requireRole } from "@/lib/auth";
import { GlassCard, SectionTitle } from "@/components/ui-gg";
export const dynamic = "force-dynamic";
export default async function ScanPage() { await requireRole("owner"); return <div className="mx-auto max-w-lg py-8"><SectionTitle eyebrow="Front desk" title="Scan a member pass." /><GlassCard className="grid min-h-80 place-items-center p-8 text-center"><div><div className="mx-auto mb-5 grid size-20 place-items-center rounded-2xl border border-lime/30 text-4xl text-lime">▦</div><p className="text-white/50">Camera scanner ready.</p><p className="mt-2 text-xs text-white/30">QR scanning connects in the next stage.</p></div></GlassCard></div>; }
