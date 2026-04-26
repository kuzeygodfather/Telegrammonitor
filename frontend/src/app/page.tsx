"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Bell, Users, AlertTriangle, Eye, RefreshCw, Clock, ArrowRight, Activity, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/StatCard";
import { getStats, getRecentMessages } from "@/lib/api";
import { supabase, getUserId } from "@/lib/supabase";
import { useWebSocket } from "@/lib/websocket";
import { formatDateIST } from "@/lib/utils";
import type { DashboardStats, Message } from "@/types";
import { useToast } from "@/components/Toast";

interface ActiveTopic {
  id: number; title: string; durum: string; urgency: number;
  summary: string; last_aksiyon: string; last_message_at: string;
  message_count: number; group_title: string;
}

const DURUM_STYLE: Record<string, { bg: string; text: string }> = {
  SORUN: { bg: "bg-red-500/10", text: "text-red-400" },
  ONAY_BEKLIYOR: { bg: "bg-amber-500/10", text: "text-amber-400" },
  AKSIYON_GEREKLI: { bg: "bg-orange-500/10", text: "text-orange-400" },
  BILGI: { bg: "bg-sky-500/10", text: "text-sky-400" },
};

const CATEGORY_LABELS: Record<string, string> = {
  complaint: "Sikayet", issue: "Sorun", financial: "Finansal", staff: "Personel",
  customer: "Musteri", technical: "Teknik", info: "Bilgi", decision: "Karar",
};
const CATEGORY_COLORS: Record<string, string> = {
  complaint: "bg-red-900 text-red-300", issue: "bg-orange-900 text-orange-300",
  financial: "bg-yellow-900 text-yellow-300", staff: "bg-purple-900 text-purple-300",
  technical: "bg-cyan-900 text-cyan-300", decision: "bg-blue-900 text-blue-300",
  info: "bg-gray-700 text-gray-400",
};
const URGENCY_BAR: Record<number, string> = { 1: "bg-gray-600", 2: "bg-blue-600", 3: "bg-yellow-500", 4: "bg-orange-500", 5: "bg-red-500" };

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [topics, setTopics] = useState<ActiveTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const { isConnected } = useWebSocket();
  const [refreshing, setRefreshing] = useState(false);
  const [dateMode, setDateMode] = useState("today");
  const [customDate, setCustomDate] = useState(new Date().toISOString().slice(0, 10));
  const { toast } = useToast();

  const getDateRange = (mode?: string) => {
    const m = mode || dateMode;
    const now = new Date();
    if (m === "yesterday") { const d = new Date(now); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); return { since: d.toISOString(), until: e.toISOString(), label: `Dun - ${d.toLocaleDateString("tr-TR")}` }; }
    if (m === "last3") { const d = new Date(now); d.setDate(d.getDate()-3); d.setHours(0,0,0,0); return { since: d.toISOString(), until: now.toISOString(), label: "Son 3 Gun" }; }
    if (m === "last7") { const d = new Date(now); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); return { since: d.toISOString(), until: now.toISOString(), label: "Son 7 Gun" }; }
    if (m === "custom") { const d = new Date(customDate); d.setHours(0,0,0,0); const e = new Date(customDate); e.setHours(23,59,59,999); return { since: d.toISOString(), until: e.toISOString(), label: d.toLocaleDateString("tr-TR") }; }
    const d = new Date(now); d.setHours(0,0,0,0);
    return { since: d.toISOString(), until: now.toISOString(), label: `Bugun - ${d.toLocaleDateString("tr-TR")}` };
  };

  const fetchAll = async (mode?: string) => {
    const uid = getUserId();
    const { since, until } = getDateRange(mode);
    const [s, m] = await Promise.all([
      getStats(since, until).catch(() => ({ total_messages_today: 0, total_alerts: 0, unread_alerts: 0, active_groups: 0, messages_by_hour: [] } as DashboardStats)),
      getRecentMessages(30).catch(() => [] as Message[]),
    ]);
    setStats(s);
    setMessages(m);

    let topicQ = supabase.from("topics").select("id,title,durum,urgency,summary,last_aksiyon,last_message_at,message_count,groups(title)")
      .eq("user_id", uid).eq("status", "open").gte("urgency", 3).gte("last_message_at", since)
      .order("urgency", { ascending: false }).order("last_message_at", { ascending: false }).limit(30);
    const { data: t } = await topicQ;
    setTopics((t || []).map((x: Record<string, unknown>) => ({ ...x, group_title: (x.groups as Record<string, string>)?.title || "?" })) as ActiveTopic[]);
    setLoading(false);
  };

  const handleDateMode = (mode: string) => { setDateMode(mode); fetchAll(mode); };

  const refresh = async () => { setRefreshing(true); await fetchAll(); toast("Veriler guncellendi"); setRefreshing(false); };
  useEffect(() => { fetchAll(); const i = setInterval(() => fetchAll(), 30000); return () => clearInterval(i); }, []);

  const importantMessages = messages.filter(m => m.analysis && (m.analysis.urgency >= 3 || m.analysis.details?.relevant_to_manager));
  const routineMessages = messages.filter(m => !m.analysis || (m.analysis.urgency < 3 && !m.analysis.details?.relevant_to_manager));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Yonetim Paneli</h1>
        <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tarih Filtresi */}
      <div className="flex items-center gap-2 flex-wrap">
        {[{ k: "today", l: "Bugun" }, { k: "yesterday", l: "Dun" }, { k: "last3", l: "3 Gun" }, { k: "last7", l: "7 Gun" }].map(d => (
          <button key={d.k} onClick={() => handleDateMode(d.k)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${dateMode === d.k ? "bg-blue-600 text-white" : "bg-white/5 text-gray-500 hover:text-white border border-white/10"}`}>
            {d.l}
          </button>
        ))}
        <div className="flex items-center gap-1.5 ml-1">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setDateMode("custom"); fetchAll("custom"); }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-300 focus:outline-none focus:border-blue-500/50" />
        </div>
        <span className="text-[10px] text-gray-600 ml-2">{getDateRange().label}</span>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Bugunun Mesajlari" value={stats?.total_messages_today ?? 0} icon={MessageSquare} color="bg-blue-600" />
        <StatCard title="Aktif Uyarilar" value={stats?.unread_alerts ?? 0} icon={AlertTriangle} color="bg-red-600" />
        <StatCard title="Izlenen Gruplar" value={stats?.active_groups ?? 0} icon={Users} color="bg-green-600" />
        <StatCard title="Acil Konular" value={topics.length} icon={Eye} color="bg-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saatlik Grafik */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Saatlik Mesaj Yogunlugu</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats?.messages_by_hour || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={12} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }} labelFormatter={(h) => `Saat: ${h}:00`} />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Mesaj" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dikkat Gerektiren Konular - topics tablosundan */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />Dikkat Gerektiren Konular
          </h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {topics.length === 0 ? (
              <p className="text-gray-500 text-sm">Acil konu yok</p>
            ) : topics.map(t => {
              const style = DURUM_STYLE[t.durum] || DURUM_STYLE.BILGI;
              return (
                <div key={t.id} className={`p-3 rounded-lg border border-gray-700 ${style.bg}`}>
                  <div className="flex items-center gap-2 text-[10px] mb-1">
                    <span className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">{t.group_title}</span>
                    <span className={`font-bold ${style.text}`}>{t.durum}</span>
                    <span className="text-gray-500">U:{t.urgency}/5</span>
                    <span className="text-gray-600 ml-auto flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{formatDateIST(t.last_message_at)}</span>
                  </div>
                  <p className="text-sm font-medium">{t.title}</p>
                  {t.summary && (() => {
                    const sorunMatch = t.summary.match(/^SORUN:\s*(.+?)(\n|$)/);
                    return sorunMatch ? <p className="text-xs text-gray-400 mt-1">{sorunMatch[1]}</p> : <p className="text-xs text-gray-400 mt-1 line-clamp-1">{t.summary}</p>;
                  })()}
                  {t.last_aksiyon && (
                    <p className="text-[11px] text-orange-400/80 mt-1 flex items-center gap-1"><ArrowRight className="w-3 h-3" />{t.last_aksiyon}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Onemli Mesajlar */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">
          Sizi Ilgilendiren Mesajlar
          {importantMessages.length > 0 && <span className="text-sm font-normal text-gray-500 ml-2">({importantMessages.length})</span>}
        </h2>
        <div className="space-y-3">
          {importantMessages.length === 0 ? (
            <p className="text-gray-500 text-sm">Henuz onemli mesaj yok</p>
          ) : importantMessages.map(msg => (
            <div key={msg.id} className="p-4 rounded-lg border border-gray-600 bg-gray-900">
              <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                <span className="bg-gray-700 px-2 py-0.5 rounded">{msg.group_title}</span>
                <span className="text-gray-500">{msg.sender_name}</span>
                {msg.analysis && (
                  <>
                    <span className={`px-2 py-0.5 rounded ${CATEGORY_COLORS[msg.analysis.category] || "bg-gray-700 text-gray-400"}`}>
                      {CATEGORY_LABELS[msg.analysis.category] || msg.analysis.category}
                    </span>
                    {msg.analysis.details?.topic && (
                      <span className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">{msg.analysis.details.topic}</span>
                    )}
                  </>
                )}
                <span className="ml-auto text-gray-600">{formatDateIST(msg.date)}</span>
              </div>
              {msg.analysis && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${URGENCY_BAR[msg.analysis.urgency] || "bg-gray-600"}`} style={{ width: `${msg.analysis.urgency * 20}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{msg.analysis.urgency}/5</span>
                </div>
              )}
              <p className="text-sm">{msg.text}</p>
              {msg.analysis?.summary && <p className="text-xs text-blue-400 mt-2 italic">AI: {msg.analysis.summary}</p>}
              {msg.analysis?.details?.action_needed && msg.analysis.details.action_description && (
                <p className="text-xs text-orange-400 mt-1">Aksiyon: {msg.analysis.details.action_description}</p>
              )}
              {msg.matched_keywords?.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {msg.matched_keywords.map(kw => <span key={kw} className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">{kw}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Genel Akis */}
      {routineMessages.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-400">Genel Akis</h2>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {routineMessages.slice(0, 15).map(msg => (
              <div key={msg.id} className="p-2 rounded border border-gray-700/50 bg-gray-900/50">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>{msg.group_title}</span>
                  <span>{msg.sender_name}</span>
                  <span className="ml-auto">{formatDateIST(msg.date)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 truncate">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
