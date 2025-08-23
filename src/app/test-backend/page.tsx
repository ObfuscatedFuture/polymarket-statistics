"use client";

import React, { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

type Snapshot = {
  trades: any[];
  positions: any[] | Record<string, any> | null;
  value: any | null;
  meta: {
    last_viewed_at?: string;
    last_synced_at?: string;
    last_trade_at_cached?: string;
    sync_status?: string;
    error_msg?: string | null;
  } | null;
};

function fmtTime(s?: string | number | Date) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

function fmtUsd(n?: number | string | null, digits = 2) {
  if (n === null || n === undefined || n === "") return "—";
  const x = typeof n === "string" ? Number(n) : n;
  if (!isFinite(x)) return String(n);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits });
}

function fmtNum(n?: number | string | null, digits = 4) {
  if (n === null || n === undefined || n === "") return "—";
  const x = typeof n === "string" ? Number(n) : n;
  if (!isFinite(x)) return String(n);
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function badgeColor(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (s.includes("error") || s.includes("fail")) return "bg-red-500/20 text-red-200 border-red-600/40";
  if (s.includes("sync") || s.includes("ok") || s.includes("ready")) return "bg-emerald-500/20 text-emerald-200 border-emerald-600/40";
  if (s.includes("stale") || s.includes("queued")) return "bg-amber-500/20 text-amber-200 border-amber-600/40";
  return "bg-neutral-700/30 text-neutral-200 border-neutral-600/40";
}

export default function TestBackendPage() {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSnapshot() {
    if (!addr) return;
    setLoading(true);
    setError(null);
    try {
      if (!API_BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
      const res = await fetch(`${API_BASE}/api/users/${addr}/snapshot`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? ` – ${text.slice(0, 140)}` : ""}`);
      }
      const data = (await res.json()) as Snapshot;
      setSnap(data);
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }

  // Trade aggregates (best-effort, handles strings)
  const agg = (() => {
    const trades = snap?.trades ?? [];
    let buy = 0, sell = 0, notional = 0, pxSum = 0, pxCnt = 0;
    for (const t of trades) {
      const side = (t.side ?? "").toUpperCase();
      const size = Number(t.size ?? t.quantity ?? 0) || 0;
      const price = Number(t.price ?? 0) || 0;
      const quote = Number(t.quote ?? (size * price)) || 0;
      if (side === "BUY") buy += 1;
      else if (side === "SELL") sell += 1;
      notional += Math.abs(quote);
      if (isFinite(price) && price > 0) {
        pxSum += price;
        pxCnt += 1;
      }
    }
    return {
      count: trades.length,
      buy,
      sell,
      notional,
      avgPrice: pxCnt ? pxSum / pxCnt : null,
    };
  })();

  // Normalize positions to array for preview
  const posArray: any[] = React.useMemo(() => {
    const p = snap?.positions;
    if (!p) return [];
    return Array.isArray(p) ? p : Object.values(p);
  }, [snap]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Backend Snapshot Tester</h1>
          <p className="text-sm text-neutral-400">
            Calls your FastAPI <code>/api/users/:addr/snapshot</code> and shows results.
          </p>
        </header>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
          <label className="block text-sm font-medium">Wallet / Address</label>
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value.trim())}
            placeholder="0xabc... (or ENS-like)"
            className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none"
            onKeyDown={(e) => e.key === "Enter" && runSnapshot()}
          />

          <div className="flex gap-3">
            <button
              onClick={runSnapshot}
              disabled={loading || !addr}
              className="rounded-xl px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "Running…" : "Run Snapshot"}
            </button>
            <button
              onClick={() => {
                setSnap(null);
                setError(null);
                setAddr("");
              }}
              className="rounded-xl px-4 py-2 bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
            >
              Clear
            </button>
          </div>

          <p className="text-xs text-neutral-500">
            Base URL: <code>{API_BASE ?? "—"}</code>
          </p>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-800 text-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {snap && (
          <div className="space-y-6">
            {/* META */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Meta</h2>
                <span className={`text-xs px-2 py-1 rounded-lg border ${badgeColor(snap.meta?.sync_status)}`}>
                  {snap.meta?.sync_status ?? "unknown"}
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-neutral-400">Last viewed</div>
                  <div className="font-mono">{fmtTime(snap.meta?.last_viewed_at)}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Last synced</div>
                  <div className="font-mono">{fmtTime(snap.meta?.last_synced_at)}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Last trade (cached)</div>
                  <div className="font-mono">{fmtTime(snap.meta?.last_trade_at_cached)}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Errors</div>
                  <div className="font-mono">{snap.meta?.error_msg ?? "—"}</div>
                </div>
              </div>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={runSnapshot}
                  className="rounded-xl px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-sm"
                >
                  Refresh now
                </button>
              </div>
            </section>

            {/* QUICK STATS */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <h2 className="text-lg font-semibold">Quick Stats</h2>
              <ul className="mt-2 text-sm grid md:grid-cols-3 gap-2">
                <li>
                  <span className="text-neutral-400">Trades (returned):</span>{" "}
                  <span className="font-mono">{agg.count}</span>
                </li>
                <li>
                  <span className="text-neutral-400">Buy / Sell:</span>{" "}
                  <span className="font-mono">{agg.buy} / {agg.sell}</span>
                </li>
                <li>
                  <span className="text-neutral-400">Notional (abs):</span>{" "}
                  <span className="font-mono">{fmtUsd(agg.notional)}</span>
                </li>
                <li>
                  <span className="text-neutral-400">Avg trade price:</span>{" "}
                  <span className="font-mono">{agg.avgPrice === null ? "—" : fmtNum(agg.avgPrice, 4)}</span>
                </li>
                <li>
                  <span className="text-neutral-400">Positions cache:</span>{" "}
                  <span className="font-mono">{snap.positions ? "Yes" : "No"}</span>
                </li>
                <li>
                  <span className="text-neutral-400">Value cache:</span>{" "}
                  <span className="font-mono">{snap.value ? "Yes" : "No"}</span>
                </li>
              </ul>
            </section>

            {/* POSITIONS PREVIEW */}
            {posArray.length > 0 && (
              <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                <h2 className="text-lg font-semibold mb-2">Positions (sample)</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-neutral-300">
                      <tr>
                        <th className="text-left p-2">Market</th>
                        <th className="text-left p-2">Token</th>
                        <th className="text-left p-2">Qty</th>
                        <th className="text-left p-2">Avg Cost</th>
                        <th className="text-left p-2">Mark</th>
                        <th className="text-left p-2">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="text-neutral-200">
                      {posArray.slice(0, 8).map((p: any, i: number) => (
                        <tr key={p.id ?? p.token_id ?? i}>
                          <td className="p-2">{p.market_title ?? p.market ?? "—"}</td>
                          <td className="p-2 font-mono">{p.token_id ?? p.outcome ?? "—"}</td>
                          <td className="p-2 font-mono">{fmtNum(p.quantity ?? p.qty ?? p.size)}</td>
                          <td className="p-2 font-mono">{fmtNum(p.avg_price ?? p.avg_cost)}</td>
                          <td className="p-2 font-mono">{fmtNum(p.mark_price ?? p.price)}</td>
                          <td className={`p-2 font-mono ${Number(p.pnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {fmtUsd(p.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* TRADES TABLE */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <h2 className="text-lg font-semibold mb-2">Sample Trades (first 10)</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-neutral-300">
                    <tr>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Token</th>
                      <th className="text-left p-2">Side</th>
                      <th className="text-left p-2">Price</th>
                      <th className="text-left p-2">Size</th>
                      <th className="text-left p-2">Quote</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-200">
                    {(snap.trades ?? []).slice(0, 10).map((t: any, i: number) => {
                      const side = (t.side ?? "").toUpperCase();
                      return (
                        <tr key={t.trade_id ?? t.id ?? i}>
                          <td className="p-2 font-mono">
                            {fmtTime(t.traded_at ?? t.created_at)}
                          </td>
                          <td className="p-2 font-mono">{t.token_id ?? t.market_id ?? "—"}</td>
                          <td className={`p-2 ${side === "BUY" ? "text-emerald-300" : side === "SELL" ? "text-red-300" : ""}`}>
                            {side || "—"}
                          </td>
                          <td className="p-2 font-mono">{fmtNum(t.price)}</td>
                          <td className="p-2 font-mono">{fmtNum(t.size ?? t.quantity)}</td>
                          <td className="p-2 font-mono">{fmtUsd(t.quote ?? (Number(t.size ?? 0) * Number(t.price ?? 0)))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* VALUE PREVIEW (raw-ish) */}
            {snap.value && (
              <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                <h2 className="text-lg font-semibold mb-2">Value Snapshot</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                  {Object.entries(snap.value).slice(0, 9).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between bg-neutral-800/50 border border-neutral-700 rounded-lg px-3 py-2">
                      <span className="text-neutral-300">{k}</span>
                      <span className="font-mono">
                        {typeof v === "number" ? fmtNum(v) : (typeof v === "string" && !isNaN(Number(v)) ? fmtNum(Number(v)) : String(v))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* RAW JSON */}
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <h2 className="text-lg font-semibold mb-2">Raw JSON</h2>
              <pre className="text-xs bg-neutral-950 border border-neutral-800 rounded-xl p-3 overflow-auto max-h-96">
{JSON.stringify(snap, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
