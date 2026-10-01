"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const IMAGES = ["/mosquito-1.jpg", "/mosquito-2.jpg", "/mosquito-3.jpg", "/mosquito-4.jpg"];

/**
 * Rotating mosquito photo background (public-domain Anopheles images) with a
 * crossfade and manual dots, over dark scrims that keep foreground text legible.
 */
export function PhotoBackdrop({ interval = 6000 }: { interval?: number }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % IMAGES.length), interval);
    return () => clearInterval(id);
  }, [interval]);

  return (
    <>
      {IMAGES.map((src, i) => (
        <div
          key={src}
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
          style={{ backgroundImage: `url(${src})`, opacity: i === idx ? 1 : 0 }}
        />
      ))}

      {/* dark scrims for legibility + brand tint */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,11,20,0.66) 0%, rgba(7,11,20,0.82) 55%, rgba(7,11,20,0.95) 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "radial-gradient(760px 460px at 50% 44%, rgba(7,11,20,0.55), transparent 72%)" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "radial-gradient(900px 500px at 82% 0%, rgba(245,179,1,0.12), transparent 60%)" }}
      />

      {/* manual switch dots */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        {IMAGES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show background photo ${i + 1}`}
            onClick={() => setIdx(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === idx ? "w-6 bg-primary" : "w-1.5 bg-white/40 hover:bg-white/70",
            )}
          />
        ))}
      </div>
    </>
  );
}
