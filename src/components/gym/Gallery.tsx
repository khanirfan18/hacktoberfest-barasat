"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type GymImage = { id: string; url: string; caption: string | null };

export function Gallery({
  images,
  name,
  fallbackUrl,
  website,
}: {
  images: GymImage[];
  name: string;
  fallbackUrl: string | null;
  website: string | null;
}) {
  const [active, setActive] = useState<number | null>(null);
  const current = active === null ? null : images[active];

  useEffect(() => {
    if (active === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
      if (event.key === "ArrowRight") setActive((index) => index === null ? null : (index + 1) % images.length);
      if (event.key === "ArrowLeft") setActive((index) => index === null ? null : (index - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, images.length]);

  return (
    <>
      {images.length ? (
        <div className="grid h-64 grid-cols-2 gap-2 overflow-hidden rounded-[20px] sm:h-[360px] sm:grid-cols-4">
          {images.slice(0, 4).map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`View photo ${index + 1} of ${images.length}`}
              className={`group relative overflow-hidden bg-white/[0.04] ${index === 0 ? "col-span-2 row-span-2" : "hidden sm:block"}`}
            >
              <Image src={image.url} alt={image.caption || `${name} gym`} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-cover transition duration-300 group-hover:scale-105" />
              {index === 0 && images.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-noir/75 px-3 py-1 font-mono text-xs">{images.length} photos</span>}
            </button>
          ))}
          {images.slice(4).map((image, offset) => (
            <button key={image.id} type="button" onClick={() => setActive(offset + 4)} className="sr-only" aria-label={`View photo ${offset + 5} of ${images.length}`} />
          ))}
        </div>
      ) : (
        <div className="relative grid h-64 place-items-center overflow-hidden rounded-[20px] bg-gradient-to-br from-[#263034] via-[#14191d] to-[#36213a] sm:h-[360px]">
          {fallbackUrl && (
            <>
              <Image src={fallbackUrl} alt={`${name} exterior`} fill unoptimized sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" />
              {website && <a href={website} target="_blank" rel="noreferrer" className="absolute bottom-3 right-3 rounded-full bg-noir/80 px-3 py-1.5 text-[10px] text-white/75">Image from gym website ↗</a>}
            </>
          )}
          {!fallbackUrl && <span className="font-display text-5xl text-lime/70">{name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>}
        </div>
      )}
      {active !== null && current && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label={`${name} photo gallery`} onClick={() => setActive(null)}>
          <button type="button" onClick={() => setActive(null)} aria-label="Close gallery" className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/50 p-3"><X /></button>
          {images.length > 1 && (
            <button type="button" aria-label="Previous photo" onClick={(event) => { event.stopPropagation(); setActive((active - 1 + images.length) % images.length); }} className="absolute left-3 rounded-full bg-black/60 p-3"><ChevronLeft /></button>
          )}
          <figure className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            <Image src={current.url} alt={current.caption || `${name} gym`} width={1600} height={1200} unoptimized className="max-h-[82vh] max-w-[90vw] object-contain" />
            {current.caption && <figcaption className="mt-3 text-center text-sm text-white/70">{current.caption}</figcaption>}
          </figure>
          {images.length > 1 && (
            <button type="button" aria-label="Next photo" onClick={(event) => { event.stopPropagation(); setActive((active + 1) % images.length); }} className="absolute right-3 rounded-full bg-black/60 p-3"><ChevronRight /></button>
          )}
        </div>
      )}
    </>
  );
}
