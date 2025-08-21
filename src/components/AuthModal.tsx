// components/AuthModal.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Provider } from "@supabase/supabase-js";
import { X } from "lucide-react";

type Mode = "login" | "signup";

const oauthProviders: { key: Provider; label: string }[] = [
  { key: "google", label: "Continue with Google" },
  { key: "github", label: "Continue with GitHub" },
  { key: "discord", label: "Continue with Discord" },
];

export default function AuthModal({
  open,
  onClose,
  initialMode = "login",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("redirect") || "/dashboard";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;

  // reset state when modal opens or mode changes from outside
  useEffect(() => {
    setMode(initialMode);
    setEmail("");
    setPassword("");
    setError(null);
    setMessage(null);
  }, [initialMode, open]);

  // esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const resetMsgs = () => {
    setError(null);
    setMessage(null);
  };

  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // ----- Handlers -----

  const handleOAuth = async (provider: Provider) =>
    withBusy(async () => {
      resetMsgs();
      const redirectTo =
        origin && `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo || undefined },
      });
      if (error) throw error;
      // Redirect handled by provider -> /auth/callback sets session -> redirects to `next`
    });

  const handleLogin = async () =>
    withBusy(async () => {
      resetMsgs();
      if (!email || !password) {
        setError("Please enter your email and password.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // OPTIONAL: sync server cookies for RSC-protected pages
      // Implement POST /auth/set (reads tokens & sets cookies via @supabase/ssr)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await fetch("/auth/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          });
        }
      } catch {
        // non-fatal; we'll still navigate client-side
      }

      setMessage("Logged in! Redirecting…");
      onClose?.();
      router.push(next);
      router.refresh();
    });

  const handleSignup = async () =>
    withBusy(async () => {
      resetMsgs();
      if (!email || !password) {
        setError("Please enter your email and password.");
        return;
      }
      const emailRedirectTo =
        origin && `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: emailRedirectTo || undefined },
      });
      if (error) throw error;

      if (data.session) {
        // Email confirmations OFF → already signed in
        onClose?.();
        router.push(next);
        router.refresh();
      } else {
        // Email confirmations ON → wait for link
        setMessage("Account created. Check your email to confirm.");
        setMode("login");
      }
    });

  const handleMagicLink = async () =>
    withBusy(async () => {
      resetMsgs();
      if (!email) {
        setError("Enter an email to receive a magic link.");
        return;
      }
      const emailRedirectTo =
        origin && `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: emailRedirectTo || undefined },
      });
      if (error) throw error;
      setMessage("Magic link sent! Check your email.");
    });

  if (!open) return null;

  // ----- UI -----
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md mx-4 bg-[#0f1115] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 mb-4 rounded-xl bg-white/5 p-1">
          <button
            onClick={() => setMode("login")}
            className={`py-2 rounded-lg text-sm font-medium transition ${
              mode === "login"
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`py-2 rounded-lg text-sm font-medium transition ${
              mode === "signup"
                ? "bg-white/10 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* OAuth */}
        <div className="space-y-2">
          {oauthProviders.map((p) => (
            <button
              key={p.key}
              onClick={() => handleOAuth(p.key)}
              disabled={busy}
              className="w-full text-sm font-medium rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white py-2.5 transition flex items-center justify-center"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="h-px flex-1 bg-white/10" />
          <span className="px-3 text-xs text-white/50">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Email / Password */}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mode === "login" ? handleLogin() : handleSignup();
          }}
        >
          <div className="space-y-1.5">
            <label className="text-xs text-white/60">Email</label>
            <input
              type="email"
              className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 px-3 py-2.5 outline-none focus:ring-2 focus:ring-white/20"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-white/60">Password</label>
            <input
              type="password"
              className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 px-3 py-2.5 outline-none focus:ring-2 focus:ring-white/20"
              placeholder={mode === "login" ? "••••••••" : "At least 6 characters"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-2 rounded-xl text-sm font-semibold py-2.5
                       bg-gradient-to-r from-[#6e5efb] to-[#2bc2ff]
                       hover:opacity-95 active:opacity-90 text-white transition"
          >
            {busy
              ? "Working..."
              : mode === "login"
              ? "Log in"
              : "Create account"}
          </button>
        </form>

        {/* Secondary */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={handleMagicLink}
            disabled={busy}
            className="text-xs text-white/60 hover:text-white transition"
          >
            Send magic link instead
          </button>
          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-xs text-white/60 hover:text-white transition"
          >
            {mode === "login"
              ? "Don’t have an account? Sign up"
              : "Already have an account? Log in"}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-3 text-sm text-emerald-300 bg-emerald-300/10 border border-emerald-300/20 rounded-lg px-3 py-2">
            {message}
          </p>
        )}

        <p className="mt-4 text-[11px] leading-snug text-white/40">
          By continuing, you agree to our Terms and acknowledge our Privacy Policy.
        </p>
      </div>
    </div>
  );
}
