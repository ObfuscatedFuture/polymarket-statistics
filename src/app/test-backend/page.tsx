"use client";

import React, { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

type Snapshot = {
  trades: any[];
  positions: any | null;
  value: any | null;
  meta: {
    last_viewed_at?: string;
    last_synced_at?: string;
    last_trade_at_cached?: string;
    sync_status?: string;
    error_msg?: string | null;
  } | null;
};

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
      const res = await fetch(`${API_BASE}/api/users/${addr}/snapshot`, {
        method: "GET",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Snapshot;
      setSnap(data);
    } catch (e: any) {
      setError(e?.message ?? "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
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
            placeholder="0xabc... or ENS-like"
            className="w-full rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 outline-none"
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
            Base URL: <code>{API_BASE}</code>
          </p>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-800 text-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        {snap && (
          <div className="space-y-6">
            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <h2 className="text-lg font-semibold mb-2">Meta</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-neutral-400">Sync status</div>
                  <div className="font-mono">{snap.meta?.sync_status ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Last viewed</div>
                  <div className="font-mono">{snap.meta?.last_viewed_at ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Last synced</div>
                  <div className="font-mono">{snap.meta?.last_synced_at ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Last trade cached</div>
                  <div className="font-mono">{snap.meta?.last_trade_at_cached ?? "—"}</div>
                </div>
              </div>
              {snap.meta?.error_msg && (
                <div className="mt-2 text-sm text-red-300">Error: {snap.meta.error_msg}</div>
              )}
              <div className="mt-3 flex gap-3">
                <button
                  onClick={runSnapshot}
                  className="rounded-xl px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-sm"
                >
                  Refresh now
                </button>
              </div>
            </section>

            <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <h2 className="text-lg font-semibold">Quick Stats</h2>
              <ul className="mt-2 text-sm grid grid-cols-2 gap-2">
                <li>
                  <span className="text-neutral-400">Trades (returned):</span>{" "}
                  <span className="font-mono">{snap.trades?.length ?? 0}</span>
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
                    {(snap.trades ?? []).slice(0, 10).map((t: any) => (
                      <tr key={t.trade_id ?? t.id}>
                        <td className="p-2 font-mono">
                          {t.traded_at ?? t.created_at ?? "—"}
                        </td>
                        <td className="p-2 font-mono">{t.token_id ?? "—"}</td>
                        <td className="p-2">{t.side ?? "—"}</td>
                        <td className="p-2 font-mono">{t.price ?? "—"}</td>
                        <td className="p-2 font-mono">{t.size ?? "—"}</td>
                        <td className="p-2 font-mono">{t.quote ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

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
