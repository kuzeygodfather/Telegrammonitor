"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone, Globe, Trash2, Loader2, ShieldX, RefreshCw, Check } from "lucide-react";

interface Session {
  id: number;
  session_token: string;
  device_info: string;
  ip_address: string;
  user_agent: string;
  last_active: string;
  created_at: string;
  is_active: boolean;
}

function parseDevice(ua: string): { type: string; browser: string; os: string } {
  const mobile = /mobile|android|iphone|ipad/i.test(ua);
  let browser = "Bilinmeyen";
  if (/chrome/i.test(ua) && !/edge/i.test(ua)) browser = "Chrome";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/edge/i.test(ua)) browser = "Edge";

  let os = "Bilinmeyen";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  return { type: mobile ? "mobile" : "desktop", browser, os };
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "su an";
  if (m < 60) return m + " dk once";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " sa once";
  return Math.floor(h / 24) + " gun once";
}

export default function SessionManager({ onSaved }: { onSaved?: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | null>(null);

  const getUserId = () => { try { return JSON.parse(localStorage.getItem("tg_user") || "{}").id || 0; } catch { return 0; } };
  const getToken = () => localStorage.getItem("tg_session_token") || "";

  const load = async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/session/list?user_id=${uid}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id: number) => {
    setRevoking(id);
    await fetch("/api/session/revoke", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id, user_id: getUserId() }) });
    setSessions(p => p.filter(s => s.id !== id));
    setRevoking(null);
  };

  const revokeAll = async () => {
    if (!confirm("Bu cihaz haric tum oturumlari kapatmak istediginize emin misiniz?")) return;
    await fetch("/api/session/revoke-all", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: getUserId(), except_token: getToken() }) });
    load();
  };

  const currentToken = getToken();

  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Yukleniyor...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{sessions.length} aktif oturum</span>
        <div className="flex gap-2">
          <button onClick={load} className="text-[10px] text-gray-500 hover:text-blue-400 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Yenile</button>
          {sessions.length > 1 && <button onClick={revokeAll} className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1"><ShieldX className="w-3 h-3" /> Digerlerini Kapat</button>}
        </div>
      </div>

      {sessions.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-4">Aktif oturum yok</p>
      ) : sessions.map(s => {
        const device = parseDevice(s.user_agent || s.device_info || "");
        const isCurrent = s.session_token === currentToken;
        const DeviceIcon = device.type === "mobile" ? Smartphone : Monitor;

        return (
          <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isCurrent ? "bg-green-600/5 border-green-600/20" : "bg-white/[0.02] border-white/5"}`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isCurrent ? "bg-green-600/20" : "bg-gray-700/30"}`}>
              <DeviceIcon className={`w-4 h-4 ${isCurrent ? "text-green-400" : "text-gray-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{device.browser} - {device.os}</span>
                {isCurrent && <span className="text-[9px] bg-green-600/20 text-green-400 px-1.5 py-0.5 rounded-full">Bu Cihaz</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-600">
                <span>{s.ip_address || "IP bilinmiyor"}</span>
                <span>-</span>
                <span>{timeAgo(s.last_active)}</span>
              </div>
            </div>
            {!isCurrent && (
              <button onClick={() => revoke(s.id)} disabled={revoking === s.id}
                className="text-gray-600 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-600/10 transition-colors disabled:opacity-50">
                {revoking === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
