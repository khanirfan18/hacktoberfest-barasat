import { requireRole } from "@/lib/auth";
import { GlassCard, SectionTitle, StatTile } from "@/components/ui-gg";
export const dynamic = "force-dynamic";
export default async function AdminPage() { await requireRole("super_admin"); return <div className="py-8"><SectionTitle eyebrow="Control room" title="The network at a glance." /><div className="grid gap-3 sm:grid-cols-3"><StatTile label="Live gyms" value="12" /><StatTile label="Members" value="428" /><StatTile label="Claims pending" value="03" /></div><GlassCard className="mt-6 p-6"><p className="font-mono text-xs uppercase text-white/40">Moderation queue</p><p className="mt-4 text-sm text-white/50">Nothing needs your attention.</p></GlassCard></div>; }
