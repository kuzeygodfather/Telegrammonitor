"use client";

import { useEffect, useState } from "react";
import { Reply, Clock, Users, AlertTriangle, CheckCircle, AtSign, Loader2, Download, RefreshCw, BarChart3, ChevronDown, Check, XCircle, MessageSquare, Calendar } from "lucide-react";

interface ReportData {
  total: number;
  pending: number;
  auto_replied: number;
  manual_replied: number;
  by_sender: Record<string, { total: number; pending: number; auto: number; replied: number }>;
  by_day: Record<string, { total: number; auto: number; replied: number; pending: number }>;
  by_hour: Record<string, number>;
  timeout_minutes: number;
  mentions: Array<{
    id: number; sender_name: string; message_text: string;
    mentioned_at: string; replied: boolean; auto_replied: boolean; conversation_context?: { sender: string; text: string; time: string }[];
  }>;
}

function formatDate(d: string) { return new Date(d).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}dk`; const h = Math.floor(m/60); if (h < 24) return `${h}sa`; return `${Math.floor(h/24)}g`; }

export default function AutoReplyReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [showAllMentions, setShowAllMentions] = useState(false);
  const [filter, setFilter] = useState<"all"|"pending"|"auto"|"replied">("all");

  const getUserId = () => { try { return JSON.parse(localStorage.getItem("tg_user") || "{}").id || 0; } catch { return 0; } };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto-reply/report?user_id=${getUserId()}&days=${days}`);
      const d = await res.json();
      if (!d.error) setData(d);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [days]);

  const exportCSV = () => {
    if (!data) return;
    const header = "Tarih,Gonderen,Mesaj,Durum\n";
    const rows = data.mentions.map(m => `"${formatDate(m.mentioned_at)}","${m.sender_name || ''}","${(m.message_text || '').replace(/"/g, '""').slice(0, 200)}","${m.auto_replied ? 'Oto Yanit' : m.replied ? 'Cevaplanmis' : 'Bekliyor'}"`).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `oto-yanit-rapor-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-500 text-sm">Rapor yuklenemedi</div>;

  const filteredMentions = data.mentions.filter(m => {
    if (filter === "pending") return !m.replied && !m.auto_replied;
    if (filter === "auto") return m.auto_replied;
    if (filter === "replied") return m.replied && !m.auto_replied;
    return true;
  });

  const senders = Object.entries(data.by_sender);
  const days_sorted = Object.entries(data.by_day).sort((a, b) => b[0].localeCompare(a[0]));
  const maxHourVal = Math.max(...Object.values(data.by_hour), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Reply className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-bold">Otomatik Yanit Raporu</h2>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100">
            <option value={7}>Son 7 Gun</option>
            <option value={14}>Son 14 Gun</option>
            <option value={30}>Son 30 Gun</option>
            <option value={90}>Son 90 Gun</option>
          </select>
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs"><Download className="w-3.5 h-3.5" /> CSV</button>
          <button onClick={load} className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs"><RefreshCw className="w-3.5 h-3.5" /> Yenile</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-white">{data.total}</p>
          <p className="text-[10px] text-gray-500 mt-1">Toplam Etiketleme</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-orange-400">{data.pending}</p>
          <p className="text-[10px] text-gray-500 mt-1">Bekleyen</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-blue-400">{data.auto_replied}</p>
          <p className="text-[10px] text-gray-500 mt-1">Otomatik Yanit</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-green-400">{data.manual_replied}</p>
          <p className="text-[10px] text-gray-500 mt-1">Manuel Cevap</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Sender */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" /> Gonderene Gore</h3>
          {senders.length === 0 ? <p className="text-xs text-gray-600">Veri yok</p> : (
            <div className="space-y-2">
              {senders.slice(0, 10).map(([name, s]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-300 min-w-[100px] truncate">{name}</span>
                  <div className="flex-1 flex items-center gap-1">
                    {s.replied > 0 && <div className="h-5 bg-green-600/30 rounded" style={{ width: `${(s.replied / s.total) * 100}%` }} />}
                    {s.auto > 0 && <div className="h-5 bg-blue-600/30 rounded" style={{ width: `${(s.auto / s.total) * 100}%` }} />}
                    {s.pending > 0 && <div className="h-5 bg-orange-600/30 rounded" style={{ width: `${(s.pending / s.total) * 100}%` }} />}
                  </div>
                  <span className="text-[10px] text-gray-500 min-w-[30px] text-right">{s.total}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-700/50 text-[9px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-600/50" /> Cevap</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-600/50" /> Oto</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-600/50" /> Bekleyen</span>
              </div>
            </div>
          )}
        </div>

        {/* By Hour */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> Saat Bazli Dagilim</h3>
          <div className="flex items-end gap-0.5 h-32">
            {Array.from({ length: 24 }, (_, h) => {
              const key = String(h).padStart(2, "0");
              const val = data.by_hour[key] || 0;
              const pct = (val / maxHourVal) * 100;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-blue-600/30 rounded-t transition-all" style={{ height: `${Math.max(pct, 2)}%` }} title={`${key}:00 - ${val} etiketleme`} />
                  {h % 4 === 0 && <span className="text-[8px] text-gray-600">{key}</span>}
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-gray-600 mt-2 text-center">Etiketlemelerin saat bazli dagilimi (Istanbul saati)</p>
        </div>
      </div>

      {/* Daily breakdown */}
      {days_sorted.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-purple-400" /> Gunluk Ozet</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-3">Tarih</th>
                  <th className="text-center py-2 px-3">Toplam</th>
                  <th className="text-center py-2 px-3">Oto Yanit</th>
                  <th className="text-center py-2 px-3">Cevaplanmis</th>
                  <th className="text-center py-2 px-3">Bekleyen</th>
                </tr>
              </thead>
              <tbody>
                {days_sorted.slice(0, 14).map(([day, s]) => (
                  <tr key={day} className="border-b border-gray-700/30 hover:bg-gray-700/20">
                    <td className="py-2 px-3 text-gray-300">{new Date(day + "T00:00:00").toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td className="text-center py-2 px-3 font-medium">{s.total}</td>
                    <td className="text-center py-2 px-3 text-blue-400">{s.auto}</td>
                    <td className="text-center py-2 px-3 text-green-400">{s.replied}</td>
                    <td className="text-center py-2 px-3 text-orange-400">{s.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Mentions */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-cyan-400" /> Detayli Gecmis</h3>
          <div className="flex gap-1">
            {([
              { k: "all" as const, l: "Tumu" },
              { k: "pending" as const, l: "Bekleyen" },
              { k: "auto" as const, l: "Oto" },
              { k: "replied" as const, l: "Cevap" },
            ]).map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className={`px-2 py-1 rounded text-[10px] font-medium ${filter === f.k ? "bg-blue-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>
                {f.l}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredMentions.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-8">Bu filtrede kayit yok</p>
          ) : (filteredMentions.slice(0, showAllMentions ? undefined : 20)).map((m) => (
            <div key={m.id} className={`rounded-lg p-3 border ${
              m.auto_replied ? "bg-blue-600/5 border-blue-600/15" :
              m.replied ? "bg-green-600/5 border-green-600/15" :
              "bg-orange-600/5 border-orange-600/15"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {m.auto_replied ? <span className="text-[10px] bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Reply className="w-2.5 h-2.5" /> Oto</span>
                   : m.replied ? <span className="text-[10px] bg-green-600/20 text-green-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Cevap</span>
                   : <span className="text-[10px] bg-orange-600/20 text-orange-300 px-1.5 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Bekliyor</span>}
                  <span className="text-[10px] text-gray-500 font-medium">{m.sender_name || "?"}</span>
                </div>
                <span className="text-[10px] text-gray-600">{formatDate(m.mentioned_at)}</span>
              </div>
              <p className="text-xs text-gray-300 mb-1 font-medium">{m.message_text || "(icerik yok)"}</p>
              {m.conversation_context && m.conversation_context.length > 0 && (
                <details className="mt-1.5">
                  <summary className="text-[9px] text-blue-400 cursor-pointer hover:text-blue-300 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    Konusma kronolojisi ({m.conversation_context.length} mesaj)
                  </summary>
                  <div className="mt-1.5 max-h-[200px] overflow-y-auto bg-gray-900/30 rounded-lg border border-gray-700/30">
                    {m.conversation_context.map((c: {sender:string;text:string;time:string}, ci: number) => {
                      const timeStr = c.time ? new Date(c.time).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit"}) : "";
                      return (
                        <div key={ci} className="flex gap-2 px-2.5 py-1.5 border-b border-gray-800/50 last:border-0">
                          <div className="flex flex-col items-center min-w-[6px]">
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${c.sender === m.sender_name ? "bg-blue-500" : "bg-gray-600"}`} />
                            {ci < m.conversation_context!.length - 1 && <div className="w-px flex-1 bg-gray-700/30 mt-0.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold ${c.sender === m.sender_name ? "text-blue-400" : "text-gray-400"}`}>{c.sender}</span>
                              {timeStr && <span className="text-[9px] text-gray-700 ml-auto">{timeStr}</span>}
                            </div>
                            <p className="text-[10px] text-gray-400 truncate">{c.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>

        {filteredMentions.length > 20 && !showAllMentions && (
          <button onClick={() => setShowAllMentions(true)} className="w-full mt-3 text-xs text-blue-400 hover:text-blue-300 py-2">
            Tumu goster ({filteredMentions.length - 20} daha)
          </button>
        )}
      </div>
    </div>
  );
}
