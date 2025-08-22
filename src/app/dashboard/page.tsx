// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Brush, Legend, BarChart, Bar
} from "recharts";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, Activity, Layers, DollarSign, Percent, Gauge, Trophy, ArrowRight, Search, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient"; // (optional) wire to your schema later

// --- Lightweight shadcn-like stubs (keep file self-contained) ---
const Card = ({ className = "", children }: any) => (
  <div className={`rounded-2xl border border-white/10 bg-[#0f1115] shadow-xl ${className}`}>{children}</div>
);
const CardHeader = ({ children, className = "" }: any) => (
  <div className={`p-5 border-b border-white/10 ${className}`}>{children}</div>
);
const CardTitle = ({ children, className = "" }: any) => (
  <h3 className={`text-white/90 text-sm font-semibold tracking-wide ${className}`}>{children}</h3>
);
const CardContent = ({ children, className = "" }: any) => (
  <div className={`p-5 ${className}`}>{children}</div>
);
const Button = ({ children, className = "", ...props }: any) => (
  <button
    {...props}
    className={`rounded-xl px-3 py-2 text-sm font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 transition ${className}`}
  >
    {children}
  </button>
);

// ---------- Types ----------
type DailyPnl = {
  date: string; realized: number; unrealized: number; fees: number;
};
type Trade = {
  id: string; timestamp: string; market: string; side: "BUY" | "SELL";
  token: string; price: number; qty: number; fee: number; realizedPnl?: number;
};

// ---------- Mock data (replace with Supabase fetch) ----------
function generateMockData(): { daily: DailyPnl[]; trades: Trade[]; aggregated: any } {
  const today = new Date();
  const days = 120;
  const daily: DailyPnl[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const drift = Math.sin(i / 12) * 15 + (Math.random() - 0.5) * 20;
    const realized = Math.round(drift * 100) / 100;
    const unrealized = Math.round(((Math.random() - 0.5) * 10) * 100) / 100;
    const fees = Math.round((Math.abs(drift) * 0.02 + Math.random() * 0.5) * 100) / 100;
    daily.push({ date: d.toISOString().slice(0, 10), realized, unrealized, fees });
  }

  const markets = [
    "2028 US Presidential Winner",
    "Will BTC > $100k in 2025?",
    "S&P 500 end-of-year up?",
    "US CPI YoY >= 3% in Dec?",
  ];

  const trades: Trade[] = Array.from({ length: 40 }).map((_, i) => {
    const t = new Date(today);
    t.setDate(today.getDate() - Math.floor(Math.random() * days));
    const side = Math.random() > 0.5 ? "BUY" : "SELL";
    const token = Math.random() > 0.5 ? "YES" : "NO";
    const price = Math.round((Math.random() * 0.85 + 0.1) * 100) / 100;
    const qty = Math.ceil(Math.random() * 150) / 10;
    const fee = Math.round(price * qty * 0.01 * 100) / 100;
    return {
      id: String(i + 1),
      timestamp: t.toISOString(),
      market: markets[Math.floor(Math.random() * markets.length)],
      side, token, price, qty, fee,
      realizedPnl: Math.round(((Math.random() - 0.5) * 20) * 100) / 100,
    };
  });

  const totalRealized = daily.reduce((s, d) => s + d.realized, 0);
  const totalUnrealized = daily.reduce((s, d) => s + d.unrealized, 0);
  const totalFees = daily.reduce((s, d) => s + d.fees, 0);

  const wins = trades.filter((t) => (t.realizedPnl ?? 0) > 0).length;

  const aggregated = {
    totalRealized, totalUnrealized, totalFees,
    netPnl: totalRealized + totalUnrealized - totalFees,
    winRate: trades.length ? (wins / trades.length) : 0,
    tradesCount: trades.length,
    sharpe: (() => {
      const rets = daily.map((d) => d.realized + d.unrealized - d.fees);
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rets.length) || 1;
      return (mean / sd) * Math.sqrt(365);
    })(),
    bestMarket: trades[0]?.market ?? "—",
    worstMarket: trades[1]?.market ?? "—",
  };

  return { daily, trades, aggregated };
}

// ---------- Utils ----------
function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// ---------- Component ----------
export default function DashboardPage() {
  // Data state (mocked for now)
  const [{ daily, trades, aggregated }, setState] = useState(generateMockData());

  // View state
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const [range, setRange] = useState<"7D" | "30D" | "90D" | "ALL">("30D");

  // "Viewed user" & search UX
  const [viewedUser, setViewedUser] = useState<string>("polymarket_user");
  const [searchInput, setSearchInput] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState<boolean>(false);

  // Derived series
  const filtered = useMemo(() => {
    const cutoff = (days: number) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - days);
      return dt.toISOString().slice(0, 10);
    };
    if (range === "ALL") return daily;
    const days = range === "7D" ? 7 : range === "30D" ? 30 : 90;
    const cut = cutoff(days);
    return daily.filter((d) => d.date >= cut);
  }, [daily, range]);

  const series = useMemo(() => {
    let cum = 0;
    return filtered.map((d) => {
      const delta = d.realized + d.unrealized - d.fees;
      cum += delta;
      return {
        date: d.date,
        delta,
        realized: d.realized,
        unrealized: d.unrealized,
        fees: -d.fees,
        cumulative: cum,
      };
    });
  }, [filtered]);

  const netNow = aggregated.netPnl;
  const netColor = netNow >= 0 ? "text-emerald-400" : "text-red-400";

  // Template for loading data (wire this to Supabase + Polymarket later)
  async function loadForUser(username: string) {
    setLoading(true);
    try {
      // Example (pseudo):
      // const { data: dailyRows } = await supabase.from("daily_pnl").select("*").eq("pm_user", username).order("date");
      // const { data: tradeRows } = await supabase.from("trades").select("*").eq("pm_user", username).order("timestamp", { ascending: false }).limit(200);
      // if (dailyRows && tradeRows) setState({ daily: dailyRows, trades: tradeRows, aggregated: computeAggregates(dailyRows, tradeRows) });
      // else setState(generateMockData());

      // For now, regenerate mock to simulate a fetch:
      setState(generateMockData());
      setViewedUser(username);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    loadForUser(searchInput.trim());
    setSearchInput("");
  }

  function onRefresh() {
    loadForUser(viewedUser);
  }

  useEffect(() => {
    // Initial load (current viewedUser)
    // In real use, you might read ?user= from URL or the session user.
    // loadForUser(viewedUser);
  }, []);

  return (
    <div className="min-h-dvh bg-[#0b0d12] text-white">
      {/* NAVBAR with Search */}
      <div className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d12]/80 backdrop-blur supports-[backdrop-filter]:bg-[#0b0d12]/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#6e5efb] to-[#2bc2ff] shadow-[0_0_24px_rgba(107,99,255,0.6)]" />
            <div className="truncate">
              <div className="text-sm text-white/60">Polymarket</div>
              <div className="text-[15px] font-semibold truncate">Trader Dashboard</div>
            </div>
          </div>

          {/* Searchbar */}
          <form onSubmit={onSearchSubmit} className="hidden md:flex items-center gap-2 flex-1 max-w-xl">
            <div className="flex items-center gap-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:ring-2 focus-within:ring-[#6e5efb]/50">
              <Search className="h-4 w-4 text-white/50" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search Polymarket username…"
                className="bg-transparent text-sm outline-none w-full placeholder:text-white/40"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>

          {/* Range toggles */}
          <div className="flex items-center gap-2">
            <Button onClick={() => setRange("7D")} className={classNames(range === "7D" && "bg-white/15")}>7D</Button>
            <Button onClick={() => setRange("30D")} className={classNames(range === "30D" && "bg-white/15")}>30D</Button>
            <Button onClick={() => setRange("90D")} className={classNames(range === "90D" && "bg-white/15")}>90D</Button>
            <Button onClick={() => setRange("ALL")} className={classNames(range === "ALL" && "bg-white/15")}>All</Button>
          </div>
        </div>

        {/* Mobile search (below main row) */}
        <div className="md:hidden mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-3">
          <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
            <div className="flex items-center gap-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 focus-within:ring-2 focus-within:ring-[#6e5efb]/50">
              <Search className="h-4 w-4 text-white/50" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search Polymarket username…"
                className="bg-transparent text-sm outline-none w-full placeholder:text-white/40"
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* PROFILE STRIP (above graphs/stats) */}
        <Card className="border-white/20">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Left: Avatar + Name */}
            <div className="flex items-center gap-4">
              {/* Placeholder avatar */}
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-white/15 to-white/5 border border-white/10 flex items-center justify-center">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-white/70 text-lg font-bold">
                  {viewedUser.slice(0, 1).toUpperCase()}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-white/50">Viewing</div>
                <div className="text-xl font-semibold leading-tight">{viewedUser}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  Last updated{" "}
                  <span className="text-white/70">
                    {format(lastUpdated, "MMM d, yyyy • HH:mm")}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <Button onClick={onRefresh} className="flex items-center gap-2" disabled={loading}>
                <RotateCcw className={classNames("h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* --- SUMMARY CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total PnL</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className={`text-3xl md:text-4xl font-bold ${netColor}`}>{fmtMoney(netNow)}</div>
                  <div className="text-white/50 text-sm mt-1">
                    Realized {fmtMoney(aggregated.totalRealized)} · Unrealized {fmtMoney(aggregated.totalUnrealized)} · Fees {fmtMoney(-aggregated.totalFees)}
                  </div>
                </div>
                <div className="opacity-90">
                  {netNow >= 0 ? <TrendingUp className="h-8 w-8 text-emerald-400" /> : <TrendingDown className="h-8 w-8 text-red-400" />}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-white/60">Win rate</div>
                  <div className="text-lg font-semibold flex items-center gap-2"><Percent className="h-4 w-4 text-white/40" />{(aggregated.winRate * 100).toFixed(1)}%</div>
                </div>
                <div className="space-y-1">
                  <div className="text-white/60">Trades</div>
                  <div className="text-lg font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-white/40" />{aggregated.tradesCount}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-white/60">Sharpe (naive)</div>
                  <div className="text-lg font-semibold flex items-center gap-2"><Gauge className="h-4 w-4 text-white/40" />{aggregated.sharpe.toFixed(2)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-white/60">Fees Paid</div>
                  <div className="text-lg font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-white/40" />{fmtMoney(aggregated.totalFees)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Highlights</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <Trophy className="h-4 w-4 mt-0.5 text-emerald-400" />
                  <div>
                    <div className="text-white/70">Best Market</div>
                    <div className="text-white/90 font-medium">{aggregated.bestMarket}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Activity className="h-4 w-4 mt-0.5 text-red-400" />
                  <div>
                    <div className="text-white/70">Needs Attention</div>
                    <div className="text-white/90 font-medium">{aggregated.worstMarket}</div>
                  </div>
                </div>
                <div className="text-white/50 text-xs">* Replace with real aggregation.</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- PNL CHART --- */}
        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Equity Curve</CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={() => setMode("cumulative")} className={classNames(mode === "cumulative" && "bg-white/15")}>Cumulative</Button>
              <Button onClick={() => setMode("daily")} className={classNames(mode === "daily" && "bg-white/15")}>Daily</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {mode === "cumulative" ? (
                  <AreaChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                    <defs>
                      <linearGradient id="pnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6e5efb" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="#2bc2ff" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MM/dd")} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} width={64} />
                    <Tooltip contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} labelFormatter={(l) => format(parseISO(String(l)), "EEE, MMM d")} formatter={(v: any) => [fmtMoney(Number(v)), "Cumulative"]} />
                    <Area type="monotone" dataKey="cumulative" stroke="#6e5efb" fill="url(#pnl)" strokeWidth={2} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                    <Brush height={24} travellerWidth={8} stroke="#2bc2ff" />
                  </AreaChart>
                ) : (
                  <BarChart data={series} margin={{ top: 10, right: 24, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MM/dd")} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} width={64} />
                    <Tooltip contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} labelFormatter={(l) => format(parseISO(String(l)), "EEE, MMM d")} formatter={(v: any) => [fmtMoney(Number(v)), "Daily Net"]} />
                    <Legend />
                    <Bar dataKey="realized" stackId="a" fill="#6e5efb" name="Realized" />
                    <Bar dataKey="unrealized" stackId="a" fill="#2bc2ff" name="Unrealized" />
                    <Bar dataKey="fees" stackId="a" fill="#ef4444" name="Fees" />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                    <Brush height={24} travellerWidth={8} stroke="#2bc2ff" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* --- RECENT TRADES --- */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent Trades</CardTitle>
            <Button className="group">Export CSV <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" /></Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/60">
                  <th className="py-2 text-left font-medium">Time</th>
                  <th className="py-2 text-left font-medium">Market</th>
                  <th className="py-2 text-left font-medium">Side</th>
                  <th className="py-2 text-right font-medium">Token</th>
                  <th className="py-2 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Fee</th>
                  <th className="py-2 text-right font-medium">Realized PnL</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 12).map((t) => (
                  <tr key={t.id} className="border-t border-white/10">
                    <td className="py-3 text-white/80">{format(new Date(t.timestamp), "MMM d, HH:mm")}</td>
                    <td className="py-3 text-white/80">{t.market}</td>
                    <td className="py-3">
                      <span className={classNames("px-2 py-1 rounded-lg text-xs font-semibold", t.side === "BUY" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400")}>{t.side}</span>
                    </td>
                    <td className="py-3 text-right text-white/80">{t.token}</td>
                    <td className="py-3 text-right text-white/80">{fmtMoney(t.price)}</td>
                    <td className="py-3 text-right text-white/80">{t.qty.toLocaleString()}</td>
                    <td className="py-3 text-right text-white/80">{fmtMoney(t.fee)}</td>
                    <td className={classNames("py-3 text-right font-medium", (t.realizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(t.realizedPnl ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* --- SECONDARY ANALYTICS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribution of Daily PnL</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series.map(s => ({ date: s.date, delta: s.delta }))}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis stroke="rgba(255,255,255,0.5)" tickFormatter={(v) => `$${v}`} />
                    <Tooltip contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} formatter={(v: any) => [fmtMoney(Number(v)), "Daily Net"]} />
                    <Bar dataKey="delta" fill="#6e5efb" />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fees Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="fees" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MM/dd")} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `$${v}`} stroke="rgba(255,255,255,0.5)" tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }} labelFormatter={(l) => format(parseISO(String(l)), "EEE, MMM d")} formatter={(v: any) => [fmtMoney(Number(v)), "Fees"]} />
                    <Area type="monotone" dataKey="fees" stroke="#ef4444" fill="url(#fees)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-white/40 text-xs">
          Tip: wire the search to a Polymarket user lookup (e.g., REST or subgraph) and hydrate from Supabase caches. The Refresh button should re-pull and upsert before rendering.
        </div>
      </main>
    </div>
  );
}

// Helper for real data
export function computeAggregates(daily: DailyPnl[], trades: Trade[]) {
  const totalRealized = daily.reduce((s, d) => s + d.realized, 0);
  const totalUnrealized = daily.reduce((s, d) => s + d.unrealized, 0);
  const totalFees = daily.reduce((s, d) => s + d.fees, 0);
  const netPnl = totalRealized + totalUnrealized - totalFees;
  const wins = trades.filter((t) => (t.realizedPnl ?? 0) > 0).length;
  const winRate = trades.length ? wins / trades.length : 0;
  const rets = daily.map((d) => d.realized + d.unrealized - d.fees);
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const sd = Math.sqrt(rets.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / Math.max(rets.length, 1)) || 1;
  const sharpe = (mean / sd) * Math.sqrt(365);
  return { totalRealized, totalUnrealized, totalFees, netPnl, winRate, tradesCount: trades.length, sharpe };
}
