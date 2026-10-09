export function HeatStrip({ values }: { values: number[] }) {
  return <div className="flex h-10 items-end gap-1">{values.map((value, index) => <span key={index} className="flex-1 rounded-sm" style={{ height: `${Math.max(8, value * 100)}%`, background: `linear-gradient(to top, #c6ff3d, #ff3dcb ${value * 100}%)` }} />)}</div>;
}
