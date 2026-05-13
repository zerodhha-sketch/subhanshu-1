"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminJson } from "@/components/admin/adminFetch";
import { ScopeUserBar } from "@/components/admin/ScopeUserBar";
import { computeOrderPnl } from "@/lib/admin-orders-pnl";

type LiveTrade = {
  _id: string;
  clientId?: string;
  userName?: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  totalValue: number;
  productType: string;
  optionType?: string;
  strikePrice?: number;
  expiry?: string;
  pnl: number;
  status: string;
  createdAt: string;
};

const emptyTrade = {
  userId: "",
  symbol: "",
  exchange: "NSE",
  side: "BUY" as "BUY" | "SELL",
  qty: 1,
  productType: "CNC",
  optionType: "",
  strikePrice: "",
  expiry: "",
};

type OrderSegment = { key: string; label: string };

type OrderRow = {
  id: string;
  segmentKey: string;
  market?: string;
  symbol: string;
  side: "BUY" | "SELL";
  productType?: string;
  optionType?: string;
  strikePrice?: number;
  exchange?: string;
  orderTag?: string;
  expiryDate?: string;
  changePct?: number;
  orderPrice?: number;
  qty: number;
  avgPrice: number;
  ltp: number;
  buyPrice?: number;
  sellPrice?: number;
  lots?: number;
  pnlManual?: boolean;
  pnlPct?: number;
  pnl: number;
  status: "OPEN" | "CLOSED";
};

const DEFAULT_SEGMENTS: OrderSegment[] = [
  { key: "positions", label: "Positions" },
  { key: "openOrders", label: "Open Orders" },
  { key: "baskets", label: "Baskets" },
  { key: "stockSip", label: "Stock SIP" },
  { key: "gtt", label: "GTT" },
];

let _rowCounter = 0;
function emptyRow(): OrderRow {
  _rowCounter += 1;
  const base = {
    id: `${Date.now()}-${_rowCounter}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: "",
    market: "NSE",
    productType: "Delivery",
    optionType: "CE",
    strikePrice: 0,
    exchange: "NSEFO",
    orderTag: "At Market",
    expiryDate: "",
    changePct: 0,
    orderPrice: 0,
    avgPrice: 0,
    ltp: 0,
    qty: 0,
    buyPrice: 0,
    sellPrice: 0,
    lots: 1,
    pnlManual: false,
    pnlPct: 0,
    pnl: 0,
    side: "BUY" as const,
    segmentKey: "positions",
    status: "OPEN" as const,
  };
  return { ...base, pnl: computeOrderPnl(base) };
}

function patchRow(r: OrderRow, patch: Partial<OrderRow>): OrderRow {
  const next = { ...r, ...patch };
  if (!next.pnlManual) {
    next.pnl = computeOrderPnl(next);
  }
  return next;
}

type UserOpt = { _id: string; clientId?: string; email?: string; fullName?: string };

const inp =
  "min-w-[4rem] rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 outline-none focus:border-emerald-500";
const inpNum = `${inp} text-right`;

function expiryDateToAngel(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return "";
  return `${day.padStart(2, "0")}${months[idx]}${year}`;
}

function normalizeExch(exchange: string): string {
  const map: Record<string, string> = {
    NSEFO: "NFO", BSEFO: "BFO", NSE: "NSE", BSE: "BSE",
    NFO: "NFO", BFO: "BFO", MCX: "MCX",
  };
  return map[exchange?.toUpperCase()] ?? exchange?.toUpperCase() ?? "NSE";
}

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const initialScope = searchParams.get("scopeUserId") || "";
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [scopeUserId, setScopeUserId] = useState(initialScope);
  const [segments, setSegments] = useState<OrderSegment[]>(DEFAULT_SEGMENTS);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [placingRowIdx, setPlacingRowIdx] = useState<number | null>(null);

  // Live trades (real MongoDB trades)
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [liveTradesLoading, setLiveTradesLoading] = useState(false);
  const [liveTradesErr, setLiveTradesErr] = useState<string | null>(null);
  const [tradeForm, setTradeForm] = useState({ ...emptyTrade });
  const [tradePlacing, setTradePlacing] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [tradeErr, setTradeErr] = useState<string | null>(null);
  // Trade CRUD state
  const [editingTrades, setEditingTrades] = useState<Record<string, LiveTrade>>({});
  const [savingTradeId, setSavingTradeId] = useState<string | null>(null);
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showOptionType, setShowOptionType] = useState(true);
  const [showSide, setShowSide] = useState(true);

  const totalPnl = useMemo(
    () => rows.reduce((a, o) => a + computeOrderPnl(o), 0),
    [rows],
  );

  const loadUsers = useCallback(async () => {
    try {
      const data = await adminJson<{ users: UserOpt[] }>("/api/admin/users");
      setUsers(data.users || []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setErr(null);
    const q = scopeUserId ? `?scopeUserId=${encodeURIComponent(scopeUserId)}` : "";
    try {
      const data = await adminJson<{
        config?: {
          segments?: OrderSegment[];
          orders?: OrderRow[];
          showOptionType?: boolean;
          showSide?: boolean;
        };
        source?: string;
      }>(`/api/admin/orders${q}`);
      const cfg = data.config || {};
      setShowOptionType(cfg.showOptionType !== false);
      setShowSide(cfg.showSide !== false);
      const segs = cfg.segments;
      setSegments(
        Array.isArray(segs) && segs.length > 0 ? segs : DEFAULT_SEGMENTS,
      );
      const list = cfg.orders;
      setRows(
        Array.isArray(list)
          ? list.map((row) =>
              patchRow(
                {
                  ...row,
                  segmentKey: row.segmentKey || "positions",
                  market: row.market || "NSE",
                  productType: row.productType || "Delivery",
                  optionType: row.optionType || "CE",
                  exchange: row.exchange || row.market || "NSEFO",
                  orderTag: row.orderTag || "At Market",
                },
                {},
              ),
            )
          : [],
      );
      setSource(String(data.source || ""));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [scopeUserId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const summary = {
      dayPnl: rows.reduce((a, o) => a + computeOrderPnl(o), 0),
      totalPnl: rows.reduce((a, o) => a + computeOrderPnl(o), 0),
    };
    try {
      await adminJson("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({
          scopeUserId: scopeUserId || null,
          config: {
            summary,
            segments,
            orders: rows,
            showOptionType,
            showSide,
          },
        }),
      });
      setMsg("Orders & positions saved.");
      await loadConfig();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetScope() {
    if (!confirm("Reset orders config for this scope to defaults?")) return;
    setSaving(true);
    try {
      const q = scopeUserId ? `?scopeUserId=${encodeURIComponent(scopeUserId)}` : "";
      await adminJson(`/api/admin/orders${q}`, { method: "DELETE" });
      setMsg("Reset.");
      await loadConfig();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(idx: number, patch: Partial<OrderRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? patchRow(r, patch) : r)),
    );
  }

  const loadLiveTrades = useCallback(async () => {
    const uid = scopeUserId || tradeForm.userId;
    setLiveTradesLoading(true);
    setLiveTradesErr(null);
    try {
      const q = uid ? `?userId=${encodeURIComponent(uid)}` : "";
      const data = await adminJson<{ trades: LiveTrade[] }>(`/api/admin/trades${q}`);
      setLiveTrades(data.trades || []);
    } catch (e) {
      setLiveTradesErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLiveTradesLoading(false);
    }
  }, [scopeUserId, tradeForm.userId]);

  // Auto-load trades whenever the scoped user changes
  useEffect(() => {
    if (scopeUserId) void loadLiveTrades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeUserId]);

  function startEditTrade(t: LiveTrade) {
    setEditingTrades((prev) => ({ ...prev, [t._id]: { ...t } }));
  }

  function cancelEditTrade(id: string) {
    setEditingTrades((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateEditTrade(id: string, field: keyof LiveTrade, value: string | number) {
    setEditingTrades((prev) => {
      const t = prev[id];
      if (!t) return prev;
      const next = { ...t, [field]: value } as LiveTrade;
      if (field === "qty" || field === "price") {
        next.totalValue = Number(next.qty) * Number(next.price);
      }
      return { ...prev, [id]: next };
    });
  }

  async function saveEditTrade(id: string) {
    const updates = editingTrades[id];
    if (!updates) return;
    setSavingTradeId(id);
    try {
      await adminJson(`/api/admin/trades/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      setLiveTrades((prev) => prev.map((t) => (t._id === id ? { ...t, ...updates } : t)));
      cancelEditTrade(id);
      setMsg("Trade updated.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingTradeId(null);
    }
  }

  async function deleteTrade(id: string) {
    if (!confirm("Permanently delete this trade?")) return;
    setDeletingTradeId(id);
    try {
      await adminJson(`/api/admin/trades/${id}`, { method: "DELETE" });
      setLiveTrades((prev) => prev.filter((t) => t._id !== id));
      setMsg("Trade deleted.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingTradeId(null);
    }
  }

  async function placeLiveTrade() {
    const uid = scopeUserId || tradeForm.userId;
    if (!uid || !tradeForm.symbol || !tradeForm.exchange || !tradeForm.qty) {
      setTradeErr("User, symbol, exchange and qty are required");
      return;
    }
    setTradePlacing(true);
    setTradeMsg(null);
    setTradeErr(null);
    try {
      const result = await adminJson<{ message: string; newBalance: number }>(
        "/api/admin/trades",
        {
          method: "POST",
          body: JSON.stringify({
            userId: uid,
            symbol: tradeForm.symbol.toUpperCase(),
            exchange: tradeForm.exchange.toUpperCase(),
            side: tradeForm.side,
            qty: Number(tradeForm.qty),
            productType: tradeForm.productType,
            optionType: tradeForm.optionType || undefined,
            strikePrice: tradeForm.strikePrice ? Number(tradeForm.strikePrice) : undefined,
            expiry: tradeForm.expiry || undefined,
          }),
        },
      );
      setTradeMsg(`${result.message} · New balance: ₹${Number(result.newBalance).toLocaleString()}`);
      void loadLiveTrades();
    } catch (e) {
      setTradeErr(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setTradePlacing(false);
    }
  }

  async function placeTradeFromRow(idx: number, side: "BUY" | "SELL") {
    if (!scopeUserId) {
      setErr("Select a user first before placing a trade.");
      return;
    }
    const row = rows[idx];
    if (!row.symbol) {
      setErr("Row has no symbol.");
      return;
    }
    setPlacingRowIdx(idx);
    setMsg(null);
    setErr(null);
    try {
      const exchange = normalizeExch(row.exchange || row.market || "NSE");
      const expiry = expiryDateToAngel(row.expiryDate || "");
      const rowPrice = row.orderPrice || row.avgPrice || row.ltp || 0;
      const result = await adminJson<{ message: string; trade: { price: number; qty: number }; newBalance: number }>(
        "/api/admin/trades",
        {
          method: "POST",
          body: JSON.stringify({
            userId: scopeUserId,
            symbol: row.symbol.toUpperCase(),
            exchange,
            side,
            qty: Number(row.qty) || 1,
            orderType: "LIMIT",
            limitPrice: rowPrice,
            productType: row.productType === "Delivery" ? "CNC" : row.productType === "Intraday" ? "MIS" : row.productType || "CNC",
            optionType: row.optionType || undefined,
            strikePrice: row.strikePrice ? Number(row.strikePrice) : undefined,
            expiry: expiry || undefined,
          }),
        },
      );
      // Sync the row: update avgPrice with actual execution price
      const updatedRows = rows.map((r, i) => {
        if (i !== idx) return r;
        return patchRow(r, {
          avgPrice: result.trade.price,
          side,
          status: "OPEN",
        });
      });
      setRows(updatedRows);
      setMsg(`${result.message} · Balance: ₹${Number(result.newBalance).toLocaleString()}`);
      // Auto-save so the updated avgPrice persists
      const summary = { dayPnl: updatedRows.reduce((a, o) => a + computeOrderPnl(o), 0), totalPnl: updatedRows.reduce((a, o) => a + computeOrderPnl(o), 0) };
      await adminJson("/api/admin/orders", {
        method: "POST",
        body: JSON.stringify({ scopeUserId, config: { summary, segments, orders: updatedRows, showOptionType, showSide } }),
      });
      void loadLiveTrades();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setPlacingRowIdx(null);
    }
  }

  return (
    <div className="mx-auto max-w-[100rem]">
      <h2 className="text-lg font-semibold text-slate-900">Orders &amp; positions</h2>
      <p className="mt-1 text-sm text-slate-600">
        Select a user, click <strong>Load</strong>, then add rows and <strong>Save</strong>. Click <strong>Buy</strong> or <strong>Sell</strong> on any row to execute a live trade for that user.
      </p>
      {source ? <p className="mt-2 text-xs text-slate-500">Source: {source}</p> : null}
      {msg ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-900">{err}</p>
      ) : null}

      <div className="mt-6">
        <ScopeUserBar
          scopeUserId={scopeUserId}
          onScopeChange={setScopeUserId}
          onLoad={() => void loadConfig()}
          users={users}
        />
      </div>

      {!scopeUserId.trim() && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Select a user above</strong> to load and edit their order rows. One user at a time.
        </div>
      )}
      {scopeUserId.trim() && (
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <strong>Editing:</strong> {users.find(u => u._id === scopeUserId)?.fullName || users.find(u => u._id === scopeUserId)?.email || scopeUserId}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-medium text-slate-500">Combined P/L (derived)</span>
        <span className="font-mono text-sm font-semibold text-slate-900">
          {totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => void resetScope()}
          disabled={saving}
          className="rounded-lg border border-rose-200 px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Reset scope
        </button>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Segments</h3>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() =>
              setSegments((s) => [
                ...s,
                { key: `seg_${Date.now()}`, label: "New segment" },
              ])
            }
          >
            Add segment
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-2 font-medium">Key</th>
                <th className="py-2 pr-2 font-medium">Label</th>
                <th className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg, i) => (
                <tr key={seg.key} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <input
                      className={inp}
                      value={seg.key}
                      onChange={(e) =>
                        setSegments((prev) =>
                          prev.map((s, j) =>
                            j === i ? { ...s, key: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={inp}
                      value={seg.label}
                      onChange={(e) =>
                        setSegments((prev) =>
                          prev.map((s, j) =>
                            j === i ? { ...s, label: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => setSegments((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Visibility in App</h3>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showOptionType}
              onChange={(e) => setShowOptionType(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Show CE / PE (Option Type)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showSide}
              onChange={(e) => setShowSide(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            />
            Show BUY / SELL (Side)
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Order rows</h3>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            Add order
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Segment</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Mkt</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Symbol</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Side</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Product</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Expiry</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Opt</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Strike</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Exch</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Tag</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Chg %</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Buy</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Sell</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Ord px</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Lots</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Qty</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Avg</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">LTP</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">P/L</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Man</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">P/L %</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Status</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium">Trade</th>
                <th className="whitespace-nowrap px-1.5 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={25} className="px-3 py-6 text-center text-slate-500">
                    No rows. Click &quot;Add order&quot; to create one.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.segmentKey || "positions"}
                        onChange={(e) => updateRow(idx, { segmentKey: e.target.value })}
                      >
                        {segments.map((seg) => (
                          <option key={seg.key} value={seg.key}>
                            {seg.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.market || ""}
                        onChange={(e) => updateRow(idx, { market: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.symbol}
                        onChange={(e) => updateRow(idx, { symbol: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.side}
                        onChange={(e) =>
                          updateRow(idx, { side: e.target.value as OrderRow["side"] })
                        }
                      >
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.productType || "Delivery"}
                        onChange={(e) => updateRow(idx, { productType: e.target.value })}
                      >
                        <option value="Delivery">Delivery</option>
                        <option value="Intraday">Intraday</option>
                        <option value="F&O">F&amp;O</option>
                        <option value="CNC">CNC</option>
                        <option value="MIS">MIS</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="date"
                        className={inp}
                        value={row.expiryDate || ""}
                        onChange={(e) => updateRow(idx, { expiryDate: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.optionType || "CE"}
                        onChange={(e) => updateRow(idx, { optionType: e.target.value })}
                      >
                        <option value="CE">CE</option>
                        <option value="PE">PE</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.strikePrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { strikePrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        className={inp}
                        value={row.exchange || ""}
                        onChange={(e) => updateRow(idx, { exchange: e.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.orderTag || "At Market"}
                        onChange={(e) => updateRow(idx, { orderTag: e.target.value })}
                      >
                        <option value="At Market">At Market</option>
                        <option value="At Limit">At Limit</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.changePct ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { changePct: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.buyPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { buyPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.sellPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { sellPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.orderPrice ?? row.avgPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { orderPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.lots ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { lots: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.qty ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { qty: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.avgPrice ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { avgPrice: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.ltp ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { ltp: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.pnl ?? 0}
                        onChange={(e) =>
                          updateRow(idx, {
                            pnl: Number(e.target.value || 0),
                            pnlManual: true,
                          })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top pt-2">
                      <input
                        type="checkbox"
                        checked={!!row.pnlManual}
                        onChange={(e) =>
                          updateRow(idx, {
                            pnlManual: e.target.checked,
                            pnl: e.target.checked
                              ? row.pnl
                              : computeOrderPnl({ ...row, pnlManual: false }),
                          })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <input
                        type="number"
                        step="any"
                        className={inpNum}
                        value={row.pnlPct ?? 0}
                        onChange={(e) =>
                          updateRow(idx, { pnlPct: Number(e.target.value || 0) })
                        }
                      />
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <select
                        className={inp}
                        value={row.status}
                        onChange={(e) =>
                          updateRow(idx, {
                            status: e.target.value as OrderRow["status"],
                          })
                        }
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={placingRowIdx !== null || !scopeUserId}
                          onClick={() => void placeTradeFromRow(idx, "BUY")}
                          className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                          title={!scopeUserId ? "Select a user first" : `BUY ${row.symbol}`}
                        >
                          {placingRowIdx === idx ? "…" : "B"}
                        </button>
                        <button
                          type="button"
                          disabled={placingRowIdx !== null || !scopeUserId}
                          onClick={() => void placeTradeFromRow(idx, "SELL")}
                          className="rounded bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                          title={!scopeUserId ? "Select a user first" : `SELL ${row.symbol}`}
                        >
                          {placingRowIdx === idx ? "…" : "S"}
                        </button>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 align-top">
                      <button
                        type="button"
                        className="whitespace-nowrap text-rose-600 hover:underline"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Place a real trade ── */}
      <section className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-emerald-900">
          Place live trade — {scopeUserId ? (users.find(u => u._id === scopeUserId)?.fullName || users.find(u => u._id === scopeUserId)?.email || scopeUserId) : "no user selected"}
        </h3>
        {!scopeUserId && (
          <p className="mb-3 text-xs text-amber-700">Select a user above first.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Symbol</label>
            <input className={inp} placeholder="NIFTY / RELIANCE / GOLD" value={tradeForm.symbol}
              onChange={(e) => setTradeForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Exchange</label>
            <select className={inp} value={tradeForm.exchange}
              onChange={(e) => setTradeForm((f) => ({ ...f, exchange: e.target.value }))}>
              <option>NSE</option><option>BSE</option><option>NFO</option>
              <option>BFO</option><option>MCX</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Side</label>
            <select className={inp} value={tradeForm.side}
              onChange={(e) => setTradeForm((f) => ({ ...f, side: e.target.value as "BUY" | "SELL" }))}>
              <option>BUY</option><option>SELL</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Qty</label>
            <input type="number" min={1} className={`${inpNum} w-20`} value={tradeForm.qty}
              onChange={(e) => setTradeForm((f) => ({ ...f, qty: Number(e.target.value) }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Product</label>
            <select className={inp} value={tradeForm.productType}
              onChange={(e) => setTradeForm((f) => ({ ...f, productType: e.target.value }))}>
              <option>CNC</option><option>MIS</option><option>NRML</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Opt type</label>
            <select className={inp} value={tradeForm.optionType}
              onChange={(e) => setTradeForm((f) => ({ ...f, optionType: e.target.value }))}>
              <option value="">—</option><option>CE</option><option>PE</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Strike</label>
            <input type="number" className={`${inpNum} w-20`} placeholder="0" value={tradeForm.strikePrice}
              onChange={(e) => setTradeForm((f) => ({ ...f, strikePrice: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">Expiry</label>
            <input className={inp} placeholder="25APR2026" value={tradeForm.expiry}
              onChange={(e) => setTradeForm((f) => ({ ...f, expiry: e.target.value }))} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={tradePlacing}
            onClick={() => void placeLiveTrade()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {tradePlacing ? "Placing…" : `${tradeForm.side} at market`}
          </button>
          <button type="button" disabled={liveTradesLoading}
            onClick={() => void loadLiveTrades()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            {liveTradesLoading ? "Loading…" : "Load trades"}
          </button>
        </div>
        {tradeMsg && <p className="mt-2 rounded bg-emerald-100 px-3 py-1.5 text-xs text-emerald-900">{tradeMsg}</p>}
        {tradeErr && <p className="mt-2 rounded bg-rose-100 px-3 py-1.5 text-xs text-rose-900">{tradeErr}</p>}
      </section>

      {/* ── Live trades CRUD table ── */}
      {scopeUserId && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Live trades (MongoDB) — {liveTrades.length} record{liveTrades.length !== 1 ? "s" : ""}
            </h3>
            <button
              type="button"
              disabled={liveTradesLoading}
              onClick={() => void loadLiveTrades()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {liveTradesLoading ? "Loading…" : "Reload"}
            </button>
          </div>
          {liveTradesErr && <p className="mb-2 text-xs text-rose-700">{liveTradesErr}</p>}
          {liveTrades.length === 0 && !liveTradesLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">No trades found for this user.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    {["Symbol","Exch","Side","Qty","Price","Total","P&L","Product","Opt","Strike","Expiry","Status","Date","Actions"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveTrades.map((t) => {
                    const editing = editingTrades[t._id];
                    const isEditing = !!editing;
                    const isSaving = savingTradeId === t._id;
                    const isDeleting = deletingTradeId === t._id;
                    const d = isEditing ? editing : t;

                    return (
                      <tr key={t._id} className={`border-b border-slate-100 ${isEditing ? "bg-amber-50" : "hover:bg-slate-50/80"}`}>
                        {/* Symbol */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input className={inp} value={d.symbol} onChange={(e) => updateEditTrade(t._id, "symbol", e.target.value)} />
                          ) : (
                            <span className="font-medium">{t.symbol}</span>
                          )}
                        </td>
                        {/* Exchange */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input className={inp} value={d.exchange} onChange={(e) => updateEditTrade(t._id, "exchange", e.target.value)} style={{ width: 52 }} />
                          ) : (
                            <span className="text-slate-500">{t.exchange}</span>
                          )}
                        </td>
                        {/* Side */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <select className={inp} value={d.side} onChange={(e) => updateEditTrade(t._id, "side", e.target.value as "BUY" | "SELL")}>
                              <option value="BUY">BUY</option>
                              <option value="SELL">SELL</option>
                            </select>
                          ) : (
                            <span className={`font-semibold ${t.side === "BUY" ? "text-emerald-700" : "text-rose-600"}`}>{t.side}</span>
                          )}
                        </td>
                        {/* Qty */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input type="number" className={inpNum} style={{ width: 60 }} value={d.qty} onChange={(e) => updateEditTrade(t._id, "qty", Number(e.target.value))} />
                          ) : (
                            <span className="text-right block">{t.qty}</span>
                          )}
                        </td>
                        {/* Price */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input type="number" step="any" className={inpNum} style={{ width: 80 }} value={d.price} onChange={(e) => updateEditTrade(t._id, "price", Number(e.target.value))} />
                          ) : (
                            <span className="text-right block">₹{Number(t.price).toLocaleString()}</span>
                          )}
                        </td>
                        {/* Total */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input type="number" step="any" className={inpNum} style={{ width: 80 }} value={d.totalValue} onChange={(e) => updateEditTrade(t._id, "totalValue", Number(e.target.value))} />
                          ) : (
                            <span className="text-right block">₹{Number(t.totalValue).toLocaleString()}</span>
                          )}
                        </td>
                        {/* P&L */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input type="number" step="any" className={inpNum} style={{ width: 72 }} value={d.pnl ?? 0} onChange={(e) => updateEditTrade(t._id, "pnl", Number(e.target.value))} />
                          ) : (
                            <span className={`text-right block ${Number(t.pnl) >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {Number(t.pnl) >= 0 ? "+" : ""}₹{Number(t.pnl ?? 0).toLocaleString()}
                            </span>
                          )}
                        </td>
                        {/* Product */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <select className={inp} value={d.productType} onChange={(e) => updateEditTrade(t._id, "productType", e.target.value)}>
                              <option>CNC</option><option>MIS</option><option>NRML</option>
                            </select>
                          ) : (
                            <span className="text-slate-500">{t.productType}</span>
                          )}
                        </td>
                        {/* Opt */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <select className={inp} value={d.optionType || ""} onChange={(e) => updateEditTrade(t._id, "optionType", e.target.value)}>
                              <option value="">—</option><option>CE</option><option>PE</option>
                            </select>
                          ) : (
                            <span className="text-slate-500">{t.optionType || "—"}</span>
                          )}
                        </td>
                        {/* Strike */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input type="number" className={inpNum} style={{ width: 72 }} value={d.strikePrice ?? ""} onChange={(e) => updateEditTrade(t._id, "strikePrice", Number(e.target.value))} />
                          ) : (
                            <span className="text-slate-500">{t.strikePrice || "—"}</span>
                          )}
                        </td>
                        {/* Expiry */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <input className={inp} style={{ width: 90 }} value={d.expiry || ""} onChange={(e) => updateEditTrade(t._id, "expiry", e.target.value)} placeholder="28APR2026" />
                          ) : (
                            <span className="text-slate-500">{t.expiry || "—"}</span>
                          )}
                        </td>
                        {/* Status */}
                        <td className="px-1.5 py-1">
                          {isEditing ? (
                            <select className={inp} value={d.status} onChange={(e) => updateEditTrade(t._id, "status", e.target.value)}>
                              <option>EXECUTED</option>
                              <option>PENDING</option>
                              <option>CANCELLED</option>
                              <option>REJECTED</option>
                            </select>
                          ) : (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.status === "EXECUTED" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                              {t.status}
                            </span>
                          )}
                        </td>
                        {/* Date */}
                        <td className="px-2 py-1 text-slate-400 whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        {/* Actions */}
                        <td className="px-1.5 py-1">
                          <div className="flex gap-1 whitespace-nowrap">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => void saveEditTrade(t._id)}
                                  className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                                >
                                  {isSaving ? "…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => cancelEditTrade(t._id)}
                                  className="rounded border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditTrade(t)}
                                  className="rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-sky-700"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void deleteTrade(t._id)}
                                  className="rounded bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
                                >
                                  {isDeleting ? "…" : "Del"}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
