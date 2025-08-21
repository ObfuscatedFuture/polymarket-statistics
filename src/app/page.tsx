'use client';

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, LineChart, ShieldCheck, Rocket } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import GlowBackdrop from "../components/GlowBackdrop";
import NoiseOverlay from "../components/NoiseOverlay";
import Pin from "../components/Pin";
import { useAuthModal } from "../app/stores/useAuthModal";

export default function Home() {
  const { openSignup } = useAuthModal();
  const [themeHue] = useState(210); // tweak this for accent hue
  const accent = `hsl(${themeHue} 100% 60%)`;
  const accentSoft = `hsla(${themeHue}, 100%, 60%, 0.25)`;

  return (
    <div className="min-h-screen bg-[#090C10] text-slate-200 antialiased">
      {/* Background elements */}
      <GlowBackdrop hue={themeHue} />
      <NoiseOverlay />

      {/* Header */}
      <Header />
      {/* Hero */}
      <main className="relative mx-auto max-w-6xl px-4">
        <section className="relative py-20 md:py-28">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-balance bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-extrabold leading-tight text-transparent md:text-6xl"
          >
            Glow‑powered performance analytics for
            <span className="relative ml-2 inline-block">
              <span className="px-2 text-white">Polymarket</span>
              <motion.span
                className="absolute -inset-1 -z-10 rounded-xl opacity-60"
                style={{ boxShadow: `0 0 100px ${accentSoft}` }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
            </span>
          </motion.h1>

          <p className="mt-6 max-w-2xl text-pretty text-slate-400 md:text-lg">
            Paste your wallet, fetch your history, and watch a neon equity curve dance—
            annotated with large buys, sells, and contract resolutions. No fluff, just vibes and signal.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <GlowButton onClick={openSignup} hue={themeHue} className="px-5 py-3">Get started</GlowButton>
            <GhostButton className="px-5 py-3">View demo</GhostButton>
          </div>

          {/* Decorative mock chart */}
          <div className="pointer-events-none relative mt-14 overflow-hidden rounded-2xl border border-white/10 bg-[#0C1016]/60 p-4 shadow-[0_0_80px_rgba(0,0,0,0.35)]">
            <HeroChart hue={themeHue} />
            <div className="absolute inset-0 -z-10" style={{ boxShadow: `inset 0 0 120px ${accentSoft}` }} />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="grid gap-6 py-8 md:grid-cols-3">
          <FeatureCard hue={themeHue} icon={LineChart} title="Glowing equity curves" desc="Smooth neon lines, brush/zoom, and event pins designed for dark rooms and sharper decisions." />
          <FeatureCard hue={themeHue} icon={ShieldCheck} title="Read‑only by default" desc="Privacy‑first: proxy reads only. No keys required until you choose to connect more." />
          <FeatureCard hue={themeHue} icon={Rocket} title="Fast & buttery" desc="Batched quotes + caching. Micro‑interactions powered by motion—60fps where it counts." />
        </section>

        {/* About */}
        <section id="about" className="py-20">
          <h2 className="text-2xl font-semibold text-white md:text-3xl">About this project</h2>
          <p className="mt-4 max-w-3xl text-slate-400">
            This is a personal analytics studio for Polymarket traders. The focus is on a tasteful, neon dark theme and
            interactive charts. We’ll start with PnL over time, event annotations, and a clean ledger—then layer in watchlists,
            conditional scenarios, and shareable deep links.
          </p>
        </section>
        {/* Disclaimer */}
        <section className="border-t border-white/5 bg-[#0A0D12]/70 py-6">
          <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
            This is an independent project, not affiliated with Polymarket — made possible by the
            <a href="https://docs.polymarket.com/developers/gamma-markets-api/overview" className="ml-1 text-slate-300 underline hover:text-slate-200">Polymarket API</a>.
          </div>
        </section>

        
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

function NavLink({ label }: { label: string }) {
  return (
    <button className="rounded-md px-2 py-1 text-sm text-slate-400 transition hover:text-slate-200">
      {label}
    </button>
  );
}
type GlowButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  hue?: number;
  className?: string;
  children: React.ReactNode;
};
function GlowButton({ hue = 210, className = "", children, ...rest }: GlowButtonProps) {
  const accent = `hsl(${hue} 100% 60%)`;
  const accentSoft = `hsla(${hue}, 100%, 60%, 0.35)`;

  return (
    <button
      {...rest} // forwards onClick, onMouseEnter, disabled, etc.
      className={`group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium text-white transition ${className}`}
      style={{
        background: `linear-gradient(180deg, ${accent} 0%, hsl(${hue} 90% 50%) 100%)`,
        boxShadow: `0 0 30px ${accentSoft}, inset 0 -8px 16px rgba(0,0,0,0.3)`,
      }}
    >
      <Sparkles className="h-4 w-4 opacity-90" />
      <span>{children}</span>
      <span
        className="absolute -inset-0.5 -z-10 rounded-xl opacity-30 blur-xl"
        style={{ background: accent }}
      />
    </button>
  );
}

function GhostButton({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

function FeatureCard({ hue, icon: Icon, title, desc }: { hue: number; icon: any; title: string; desc: string }) {
  const accentSoft = `hsla(${hue}, 100%, 60%, 0.25)`;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0C1016]/60 p-5">
      <div className="absolute -inset-1 -z-10 rounded-3xl opacity-40" style={{ boxShadow: `0 0 80px ${accentSoft}` }} />
      <div className="flex items-start gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <Icon className="h-5 w-5 text-slate-200" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function HeroChart({ hue = 210 }: { hue?: number }) {
  // Decorative SVG chart with glow – placeholder for your real chart later.
  const accent = `hsl(${hue} 100% 60%)`;
  const path = "M0,120 C120,80 140,30 240,60 C340,90 360,140 460,110 C560,80 600,30 720,60 C840,90 880,160 1000,120";
  return (
    <div className="relative h-64 w-full">
      <svg viewBox="0 0 1000 240" className="h-full w-full">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <motion.path
          d={path}
          fill="none"
          stroke={accent}
          strokeWidth="3"
          filter="url(#glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.4, ease: "easeInOut" }}
        />
        <motion.path
          d={`${path} L1000,240 L0,240 Z`}
          fill="url(#grad)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
        />
      </svg>
      {/* Faux pins */}
      <Pin hue={hue} x="24%" y="38%" label="BUY 2,500 YES @0.31" />
      <Pin hue={hue} x="72%" y="30%" label="Resolved @1.00" />
    </div>
  );
}

function Grid() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
}
