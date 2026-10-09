import { requireRole } from "@/lib/auth";
import { GlassCard, SectionTitle } from "@/components/ui-gg";
export const dynamic = "force-dynamic";
export default async function ScansPage() { await requireRole("owner"); return <div className="py-8"><SectionTitle eyebrow="Activity" title="Recent scans." /><GlassCard className="p-6"><p className="text-sm text-white/40">No scans yet today.</p></GlassCard></div>; }
