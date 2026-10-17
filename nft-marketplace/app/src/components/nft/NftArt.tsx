import { placeholderArt } from "@/lib/market";

/** Deterministic generated artwork for a mint (no off-chain metadata is fetched). */
export function NftArt({ mint, label }: { mint: string; label: string }) {
  const art = placeholderArt(mint);
  const shapeClass =
    art.shape === "circle" ? "rounded-full" : art.shape === "diamond" ? "rotate-45 rounded-2xl" : "rounded-3xl";
  return (
    <div
      role="img"
      aria-label={label}
      className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl"
      style={{ backgroundImage: `linear-gradient(${art.angle}deg, ${art.from}, ${art.to})` }}
    >
      <div aria-hidden className={`size-2/5 border-4 border-white/50 bg-white/15 backdrop-blur-sm ${shapeClass}`} />
      <span aria-hidden className="absolute bottom-2 left-2 rounded-md bg-black/35 px-1.5 py-0.5 font-mono text-[10px] text-white">
        {mint.slice(0, 6)}
      </span>
    </div>
  );
}
