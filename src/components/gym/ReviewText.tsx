export function ReviewText({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">{children}</p>;
}
