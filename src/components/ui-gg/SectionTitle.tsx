export function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return <div className="mb-6"><p className="font-mono text-xs uppercase tracking-[0.25em] text-lime">{eyebrow}</p><h2 className="mt-2 font-display text-2xl tracking-tight">{title}</h2></div>;
}
