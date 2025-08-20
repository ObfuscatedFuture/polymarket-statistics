import { motion } from "framer-motion";

export interface PinProps {
  hue: number;
  x: string;   // e.g. "24%"
  y: string;   // e.g. "38%"
  label: string;
}

export default function Pin({ hue, x, y, label }: PinProps) {
  const accent = `hsl(${hue} 100% 60%)`;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="pointer-events-auto absolute"
      style={{ left: x, top: y }}
    >
      <div className="group relative">
        <div
          className="h-2 w-2 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 18px ${accent}` }}
          aria-hidden
        />
        <div className="pointer-events-none absolute left-3 top-[-2px] hidden whitespace-nowrap rounded-xl border border-white/10 bg-[#0B0F14]/95 px-3 py-1.5 text-xs text-slate-300 shadow-2xl backdrop-blur-md group-hover:block">
          {label}
        </div>
      </div>
    </motion.div>
  );
}
