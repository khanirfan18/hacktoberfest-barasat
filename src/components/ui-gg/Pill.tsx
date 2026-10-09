export function Pill({ children, tone = "lime" }: { children: React.ReactNode; tone?: "lime" | "cyan" | "magenta" }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${tone === "lime" ? "border-lime/30 text-lime" : tone === "cyan" ? "border-cyan/30 text-cyan" : "border-magenta/30 text-magenta"}`}>{children}</span>;
}
