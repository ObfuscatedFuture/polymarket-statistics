import GridOverlay from "./GridOverlay";

export interface GlowBackdropProps {
  hue?: number; // default 210
}

export default function GlowBackdrop({ hue = 210 }: GlowBackdropProps) {
  const a = `hsla(${hue}, 100%, 50%, 0.10)`;
  const b = `hsla(${(hue + 60) % 360}, 100%, 50%, 0.08)`;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div
        className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: a }}
      />
      <div
        className="absolute bottom-[-160px] left-[15%] h-[380px] w-[380px] rounded-full blur-3xl"
        style={{ background: b }}
      />
      <GridOverlay />
    </div>
  );
}
