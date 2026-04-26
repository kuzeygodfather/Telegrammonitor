"use client";

import { useEffect, useMemo, useState } from "react";
import { Shield, RefreshCw, AlertTriangle, CheckCircle2, LogIn, LogOut, UserCog, KeyRound, UserPlus, ShieldX, ShieldCheck, Filter } from "lucide-react";
import { getUser } from "@/lib/supabase";

interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTION_META: Record<string, { label: string; icon: React.ElementType; color: string; severity: "info" | "warn" | "ok" | "danger" }> = {
  login_success:       { label: "Giris Basarili",       icon: LogIn,        color: "text-green-400",   severity: "ok" },
  login_failed:        { label: "Giris Basarisiz",      icon: ShieldX,      color: "text-red-400",     severity: "warn" },
  login_blocked:       { label: "Giris Engellendi",     icon: ShieldX,      color: "text-orange-400",  severity: "warn" },
  login_2fa_required:  { label: "2FA Istendi",          icon: ShieldCheck,  color: "text-blue-400",    severity: "info" },
  login_2fa_success:   { label: "2FA Basarili",         icon: ShieldCheck,  color: "text-green-400",   severity: "ok" },
  login_2fa_failed:    { label: "2FA Basarisiz",        icon: ShieldX,      color: "text-red-400",     severity: "warn" },
  logout:              { label: "Cikis",                icon: LogOut,       color: "text-gray-400",    severity: "info" },
  register:            { label: "Yeni Kayit",           icon: UserPlus,     color: "text-blue-400",    severity: "info" },
  api_key_updated:     { label: "API Key Guncellendi",  icon: KeyRound,     color: "text-purple-400",  severity: "info" },
  admin_activate_user: { label: "Kullanici Aktif Edildi", icon: UserCog,    color: "text-blue-400",    severity: "info" },
  admin_delete_user:   { label: "Kullanici Silindi",    icon: AlertTriangle, color: "text-red-400",    severity: "danger" },
};

function metaFor(action: string) {
  return ACTION_META[action] || { label: action, icon: Filter, color: "text-gray-400", severity: "info" as const };
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "medium" });
  } catch { return iso; }
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [denied, setDenied] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const url = "/api/admin/audit-log?limit=200" + (filterAction !== "all" ? `&action=${encodeURIComponent(filterAction)}` : "");
      const r = await fetch(url);
      if (r.status === 403) { setDenied(true); setLoading(false); return; }
      if (r.status === 401) { setError("Oturum suresi dolmus, yeniden giris yapin."); setLoading(false); return; }
      const d = await r.json();
      setLogs(Array.isArray(d.logs) ? d.logs : []);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    const u = getUser();
    if (!u || !u.is_admin) { setDenied(true); setLoading(false); return; }
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction]);

  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(fetchLogs, 15000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, filterAction]);

  const stats = useMemo(() => {
    const byAction: Record<string, number> = {};
    let failed = 0;
    let success = 0;
    for (const l of logs) {
      byAction[l.action] = (byAction[l.action] || 0) + 1;
      if (/_failed|_blocked/.test(l.action)) failed++;
      if (/_success/.test(l.action)) success++;
    }
    return { total: logs.length, failed, success, byAction };
  }, [logs]);

  if (denied) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="bg-red-600/10 border border-red-600/30 rounded-xl p-8 text-center">
          <ShieldX className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-red-300 mb-1">Erisim Reddedildi</h2>
          <p className="text-sm text-red-400/80">Audit Log sadece admin kullanicilar icindir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" /> Audit Log
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Sistem giris/cikis, admin islemleri, API key guncellemeleri</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-blue-500" />
            Otomatik yenile (15sn)
          </label>
          <button onClick={fetchLogs} disabled={loading}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-lg text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900/40 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500">Toplam Kayit</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-green-600/10 border border-green-600/20 rounded-xl p-3">
          <p className="text-[10px] text-green-400/70">Basarili Olaylar</p>
          <p className="text-2xl font-bold text-green-300">{stats.success}</p>
        </div>
        <div className="bg-red-600/10 border border-red-600/20 rounded-xl p-3">
          <p className="text-[10px] text-red-400/70">Basarisiz / Engellendi</p>
          <p className="text-2xl font-bold text-red-300">{stats.failed}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-gray-900/40 border border-white/5 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs text-gray-500">Filtre:</span>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
          className="bg-gray-800 border border-white/5 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500/40">
          <option value="all">Tumu</option>
          {Object.entries(ACTION_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-gray-600">{logs.length} kayit gosteriliyor</span>
      </div>

      {error && (
        <div className="bg-red-600/10 border border-red-600/30 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Log Table */}
      <div className="bg-gray-900/40 border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-900/60 border-b border-white/5">
              <tr className="text-gray-500 text-left">
                <th className="px-3 py-2 font-medium">Tarih</th>
                <th className="px-3 py-2 font-medium">Olay</th>
                <th className="px-3 py-2 font-medium">Kullanici</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Detay</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-600">Yukleniyor...</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-600">Kayit yok</td></tr>
              )}
              {logs.map(l => {
                const m = metaFor(l.action);
                const Icon = m.icon;
                const det = l.details && Object.keys(l.details).length
                  ? JSON.stringify(l.details)
                  : "—";
                return (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className={`flex items-center gap-1.5 ${m.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span className="font-medium">{m.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-300">
                      {l.username || (l.user_id ? `#${l.user_id}` : "—")}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">{l.ip_address || "—"}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-md truncate" title={det}>
                      {det}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action breakdown */}
      {Object.keys(stats.byAction).length > 0 && (
        <div className="bg-gray-900/40 border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-gray-500 mb-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Olay tipi dagilimi
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byAction)
              .sort(([, a], [, b]) => b - a)
              .map(([k, v]) => {
                const m = metaFor(k);
                const Icon = m.icon;
                return (
                  <div key={k} className={`flex items-center gap-1.5 bg-white/5 border border-white/5 rounded-lg px-2 py-1 text-[10px] ${m.color}`}>
                    <Icon className="w-3 h-3" /> {m.label}: <strong className="ml-0.5">{v}</strong>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
