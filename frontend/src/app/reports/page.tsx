"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Loader2, Send, BarChart3, Users, AlertTriangle, Clock, MessageSquare, RefreshCw, Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Filter, Search, Check } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import AutoReplyReport from "@/components/AutoReplyReport";

interface GroupReport { id: number; title: string; brand: string; sorun: number; bilgi: number; toplam: number; msgCount: number; top_issues: string[]; }
interface BrandStat { brand: string; sorun: number; bilgi: number; toplam: number; msgCount: number; alertCount: number; groups: number; }
interface ReportData {
  groups: GroupReport[];
  brands: BrandStat[];
  totalMsg: number; totalAlert: number; totalTopic: number;
  topPersonnel: { name: string; count: number; brand: string }[];
  dateLabel: string;
}

function getBrand(t: string): string {
  const l = t.toLowerCase().replace(/\u0130/g, "i");
  if (/bia|biabet|livebia/.test(l)) return "BIA";
  if (/benja|benjabet|livebenja|bnj/.test(l)) return "Benjabet";
  if (/dil|dilbet|dilrulet/.test(l)) return "Dilbet";
  if (/dopamin/.test(l)) return "Dopamin";
  return "Diger";
}

function toLocalDate(d: Date): string { return d.toISOString().slice(0, 10); }

function dateRange(mode: string, cs?: string, ce?: string): { since: string; until: string; label: string } {
  const now = new Date();
  if (mode === "yesterday") { const d = new Date(now); d.setDate(d.getDate()-1); d.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); return { since: d.toISOString(), until: e.toISOString(), label: `Dun - ${d.toLocaleDateString("tr-TR")}` }; }
  if (mode === "last3") { const d = new Date(now); d.setDate(d.getDate()-3); d.setHours(0,0,0,0); return { since: d.toISOString(), until: now.toISOString(), label: "Son 3 Gun" }; }
  if (mode === "last7") { const d = new Date(now); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); return { since: d.toISOString(), until: now.toISOString(), label: "Son 7 Gun" }; }
  if (mode === "last30") { const d = new Date(now); d.setDate(d.getDate()-30); d.setHours(0,0,0,0); return { since: d.toISOString(), until: now.toISOString(), label: "Son 30 Gun" }; }
  if (mode === "custom" && cs && ce) { const s = new Date(cs); s.setHours(0,0,0,0); const e = new Date(ce); e.setHours(23,59,59,999); return { since: s.toISOString(), until: e.toISOString(), label: `${s.toLocaleDateString("tr-TR")} - ${e.toLocaleDateString("tr-TR")}` }; }
  const d = new Date(now); d.setHours(0,0,0,0);
  return { since: d.toISOString(), until: now.toISOString(), label: `Bugun - ${d.toLocaleDateString("tr-TR")}` };
}

const BRAND_COLORS: Record<string, { text: string; bg: string }> = {
  BIA: { text: "text-purple-400", bg: "bg-purple-500" },
  Benjabet: { text: "text-emerald-400", bg: "bg-emerald-500" },
  Dilbet: { text: "text-cyan-400", bg: "bg-cyan-500" },
  Dopamin: { text: "text-pink-400", bg: "bg-pink-500" },
  Diger: { text: "text-gray-400", bg: "bg-gray-500" },
};

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "brand" | "ai" | "autoreply">("overview");
  const [data, setData] = useState<ReportData | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [customResult, setCustomResult] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  // Filtreler
  const [dateMode, setDateMode] = useState("today");
  const [customStart, setCustomStart] = useState(toLocalDate(new Date()));
  const [customEnd, setCustomEnd] = useState(toLocalDate(new Date()));
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [allGroups, setAllGroups] = useState<{ id: number; title: string; brand: string }[]>([]);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  // Gruplari yukle
  useEffect(() => {
    supabase.from("groups").select("id,title").eq("user_id", getUserId()).eq("is_monitored", true).order("title").then(({ data: g }) => {
      setAllGroups((g || []).map((x: Record<string, unknown>) => ({ id: x.id as number, title: x.title as string, brand: getBrand(x.title as string) })));
    });
  }, []);

  const loadReport = async (mode?: string) => {
    setLoading(true);
    const m = mode || dateMode;
    const { since, until, label } = dateRange(m, customStart, customEnd);
    const uid = getUserId();

    const [{ data: topics }, { data: msgs, count: msgCount }, { count: alertCount }] = await Promise.all([
      supabase.from("topics").select("*, groups(title)").eq("user_id", uid).gte("last_message_at", since).lte("last_message_at", until),
      supabase.from("messages").select("sender_name,group_id,groups(title)", { count: "exact" }).eq("user_id", uid).gte("created_at", since).lte("created_at", until),
      supabase.from("alerts").select("*", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since).lte("created_at", until),
    ]);

    // Grup bazli rapor
    const groupMap: Record<number, GroupReport> = {};
    (topics || []).forEach((t: Record<string, unknown>) => {
      const gTitle = (t.groups as Record<string, string>)?.title || "?";
      const gId = t.group_id as number;
      if (!groupMap[gId]) groupMap[gId] = { id: gId, title: gTitle, brand: getBrand(gTitle), sorun: 0, bilgi: 0, toplam: 0, msgCount: 0, top_issues: [] };
      groupMap[gId].toplam++;
      if (t.durum === "SORUN" || t.durum === "AKSIYON_GEREKLI" || t.durum === "ONAY_BEKLIYOR") {
        groupMap[gId].sorun++;
        groupMap[gId].top_issues.push(t.title as string);
      } else {
        groupMap[gId].bilgi++;
      }
    });

    // Mesaj sayilarini gruplara ekle
    (msgs || []).forEach((m: Record<string, unknown>) => {
      const gId = m.group_id as number;
      if (groupMap[gId]) groupMap[gId].msgCount++;
    });

    // Marka bazli istatistik
    const brandMap: Record<string, BrandStat> = {};
    Object.values(groupMap).forEach(g => {
      if (!brandMap[g.brand]) brandMap[g.brand] = { brand: g.brand, sorun: 0, bilgi: 0, toplam: 0, msgCount: 0, alertCount: 0, groups: 0 };
      brandMap[g.brand].sorun += g.sorun;
      brandMap[g.brand].bilgi += g.bilgi;
      brandMap[g.brand].toplam += g.toplam;
      brandMap[g.brand].msgCount += g.msgCount;
      brandMap[g.brand].groups++;
    });

    // Personel + marka eslestirme
    const personnelMap: Record<string, { count: number; brand: string }> = {};
    (msgs || []).forEach((m: Record<string, unknown>) => {
      const name = m.sender_name as string;
      const gTitle = (m.groups as Record<string, string>)?.title || "";
      if (name && name !== "Bilinmeyen") {
        if (!personnelMap[name]) personnelMap[name] = { count: 0, brand: getBrand(gTitle) };
        personnelMap[name].count++;
      }
    });

    setData({
      groups: Object.values(groupMap).sort((a, b) => b.sorun - a.sorun),
      brands: Object.values(brandMap).sort((a, b) => b.sorun - a.sorun),
      totalMsg: msgCount || 0,
      totalAlert: alertCount || 0,
      totalTopic: (topics || []).length,
      topPersonnel: Object.entries(personnelMap).sort((a, b) => b[1].count - a[1].count).slice(0, 20).map(([name, v]) => ({ name, count: v.count, brand: v.brand })),
      dateLabel: label,
    });
    setLoading(false);
  };

  const refresh = async () => { setRefreshing(true); await loadReport(); toast("Rapor guncellendi"); setRefreshing(false); };
  useEffect(() => { loadReport(); }, []);
  const handleDateMode = (mode: string) => { setDateMode(mode); if (mode !== "custom") loadReport(mode); };
  const handleCustomDate = () => { setDateMode("custom"); loadReport("custom"); };

  // Filtrelenmis veri
  const filteredGroups = data?.groups.filter(g => {
    if (selectedBrand !== "all" && g.brand !== selectedBrand) return false;
    if (selectedGroups.size > 0 && !selectedGroups.has(g.id)) return false;
    return true;
  }) || [];

  const filteredPersonnel = data?.topPersonnel.filter(p => {
    if (selectedBrand !== "all" && p.brand !== selectedBrand) return false;
    return true;
  }) || [];

  // AI rapor
  const generateAIReport = async () => {
    if (!customPrompt.trim()) return;
    setGenerating(true); setCustomResult("");
    const { since, until } = dateRange(dateMode, customStart, customEnd);
    const uid = getUserId();

    // Secili gruplara gore filtrele
    let topicQ = supabase.from("topics").select("title,durum,urgency,summary,last_aksiyon,groups(title)").eq("user_id", uid).gte("last_message_at", since).lte("last_message_at", until).order("urgency", { ascending: false });
    let msgQ = supabase.from("messages").select("sender_name,text,groups(title)").eq("user_id", uid).gte("created_at", since).lte("created_at", until).order("created_at", { ascending: false });

    if (selectedGroups.size > 0) {
      topicQ = topicQ.in("group_id", Array.from(selectedGroups));
      msgQ = msgQ.in("group_id", Array.from(selectedGroups));
    }

    const [{ data: topics }, { data: msgs }] = await Promise.all([topicQ, msgQ]);

    // Marka/grup filtresi uygula
    const fTopics = (topics || []).filter((t: Record<string, unknown>) => {
      if (selectedBrand === "all") return true;
      const gTitle = (t.groups as Record<string, string>)?.title || "";
      return getBrand(gTitle) === selectedBrand;
    });
    const fMsgs = (msgs || []).filter((m: Record<string, unknown>) => {
      if (selectedBrand === "all") return true;
      const gTitle = (m.groups as Record<string, string>)?.title || "";
      return getBrand(gTitle) === selectedBrand;
    });

    const brandInfo = selectedBrand !== "all" ? `MARKA: ${selectedBrand}\n` : "";
    const groupInfo = selectedGroups.size > 0 ? `SECILI GRUPLAR: ${allGroups.filter(g => selectedGroups.has(g.id)).map(g => g.title).join(", ")}\n` : "";

    const context = `${brandInfo}${groupInfo}KONULAR (${fTopics.length}):\n${fTopics.map((t: Record<string, unknown>) => `[${t.durum}|U:${t.urgency}] ${(t.groups as Record<string, string>)?.title}: ${t.title} - ${(t.summary as string || "").slice(0, 150)}`).join("\n")}\n\nMESAJLAR (${fMsgs.length}):\n${fMsgs.slice(0, 150).map((m: Record<string, unknown>) => `${(m.groups as Record<string, string>)?.title} | ${m.sender_name}: ${(m.text as string).slice(0, 100)}`).join("\n")}`;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json",    },
        body: JSON.stringify({
          max_tokens: 4000,
          prompt: `Sen bir is raporlama asistanisin. BIA, Benjabet, Dilbet markalarinin genel yoneticisi icin rapor hazirliyorsun.\n\nTARIH: ${data?.dateLabel || ""}\n${brandInfo}${groupInfo}\nRAPOR TALEBI: ${customPrompt}\n\nVERILER:\n${context}\n\nProfesyonel, detayli Turkce rapor hazirla. Basliklar, maddeler, sayisal veriler kullan. Sorunlari oncelik sirasina gore sirala.`, user_id: getUserId(),
        }),
      });
      const d = await res.json();
      setCustomResult(d.content || "Rapor olusturulamadi");
      toast("AI rapor hazir");
    } catch { setCustomResult("Hata: API'ye baglanilamadi"); }
    setGenerating(false);
  };

  // Export
  const exportWord = (content: string, filename: string) => {
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;color:#333}h1{color:#1a1a2e;font-size:18pt;border-bottom:2px solid #1a1a2e;padding-bottom:5px}h2{color:#2c3e50;font-size:14pt;margin-top:20px}h3{color:#555;font-size:12pt}table{border-collapse:collapse;width:100%;margin:10px 0}th{background:#1a1a2e;color:white;padding:8px;text-align:left}td{padding:6px;border:1px solid #ddd}.red{color:#e74c3c}.green{color:#27ae60}.purple{color:#9b59b6}</style></head><body>${content}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    toast("Word indirildi");
  };

  const exportFullReport = () => {
    if (!data) return;
    const brandLabel = selectedBrand !== "all" ? ` - ${selectedBrand}` : "";
    let h = `<h1>TG Monitor Rapor${brandLabel}</h1><p>${data.dateLabel}</p>`;
    h += `<h2>Genel Ozet</h2><table><tr><th>Metrik</th><th>Deger</th></tr><tr><td>Mesaj</td><td><b>${data.totalMsg}</b></td></tr><tr><td>Uyari</td><td><b>${data.totalAlert}</b></td></tr><tr><td>Konu</td><td><b>${data.totalTopic}</b></td></tr></table>`;

    if (data.brands.length > 0) {
      h += `<h2>Marka Bazli</h2><table><tr><th>Marka</th><th>Sorun</th><th>Bilgi</th><th>Toplam Konu</th><th>Grup</th></tr>`;
      (selectedBrand === "all" ? data.brands : data.brands.filter(b => b.brand === selectedBrand)).forEach(b => {
        h += `<tr><td><b>${b.brand}</b></td><td class='red'>${b.sorun}</td><td>${b.bilgi}</td><td>${b.toplam}</td><td>${b.groups}</td></tr>`;
      });
      h += `</table>`;
    }

    h += `<h2>Sorunlu Gruplar</h2><table><tr><th>Grup</th><th>Marka</th><th>Sorun</th><th>Toplam</th></tr>`;
    filteredGroups.filter(g => g.sorun > 0).forEach(g => {
      h += `<tr><td>${g.title}</td><td>${g.brand}</td><td class='red'><b>${g.sorun}</b></td><td>${g.toplam}</td></tr>`;
      g.top_issues.forEach(i => { h += `<tr><td colspan='4' style='padding-left:30px;color:#888'>· ${i}</td></tr>`; });
    });
    h += `</table>`;

    h += `<h2>Aktif Personel</h2><table><tr><th>#</th><th>Personel</th><th>Mesaj</th></tr>`;
    filteredPersonnel.slice(0, 20).forEach((p, i) => { h += `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.count}</td></tr>`; });
    h += `</table>`;

    exportWord(h, `rapor-${selectedBrand !== "all" ? selectedBrand + "-" : ""}${data.dateLabel.replace(/\s/g, "-")}.doc`);
  };

  // Grup secici
  const groupsByBrand = allGroups.reduce((acc, g) => { (acc[g.brand] = acc[g.brand] || []).push(g); return acc; }, {} as Record<string, typeof allGroups>);
  const filteredPickerGroups = allGroups.filter(g => {
    if (groupSearch && !g.title.toLowerCase().includes(groupSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="w-6 h-6 text-violet-400" />Raporlar</h1>
        <div className="flex gap-1.5">
          <button onClick={exportFullReport} disabled={!data} className="h-8 px-2.5 rounded-lg text-[11px] bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 flex items-center gap-1"><Download className="w-3 h-3" />Word</button>
          <button onClick={refresh} disabled={refreshing} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />Yenile</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([
          { k: "overview" as const, l: "Genel Bakis", i: BarChart3 },
          { k: "brand" as const, l: "Marka Detay", i: Filter },
          { k: "ai" as const, l: "AI Rapor", i: Send },
            { k: "autoreply" as const, l: "Oto Yanit", i: MessageSquare },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${tab === t.k ? "bg-blue-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>
            <t.i className="w-3.5 h-3.5" />{t.l}
          </button>
        ))}
      </div>

      {/* ===== FILTRE PANELI ===== */}
      <div className="bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden">
        {/* Tarih */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap border-b border-white/5">
          {[{ k: "today", l: "Bugun" }, { k: "yesterday", l: "Dun" }, { k: "last3", l: "3 Gun" }, { k: "last7", l: "7 Gun" }, { k: "last30", l: "30 Gun" }].map(d => (
            <button key={d.k} onClick={() => handleDateMode(d.k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-medium ${dateMode === d.k ? "bg-violet-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>{d.l}</button>
          ))}
          <div className="w-px h-6 bg-white/10 mx-1" />
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-300 focus:outline-none" />
          <span className="text-gray-600 text-[10px]">-</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-gray-300 focus:outline-none" />
          <button onClick={handleCustomDate} className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 rounded-lg text-[10px] text-white font-medium">Getir</button>
        </div>

        {/* Marka + Grup filtresi */}
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Marka:</span>
          {["all", "BIA", "Benjabet", "Dilbet", "Dopamin", "Diger"].map(b => (
            <button key={b} onClick={() => { setSelectedBrand(b); setSelectedGroups(new Set()); }}
              className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${selectedBrand === b
                ? (b === "all" ? "bg-blue-600 text-white" : `${BRAND_COLORS[b]?.bg || "bg-gray-500"} text-white`)
                : "bg-white/5 text-gray-500 hover:text-white"}`}>
              {b === "all" ? "Tumu" : b}
            </button>
          ))}

          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Grup secici */}
          <div className="relative">
            <button onClick={() => setShowGroupPicker(!showGroupPicker)} className={`px-3 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 border transition-all ${selectedGroups.size > 0 ? "bg-violet-600/20 border-violet-500/30 text-violet-400" : "bg-white/5 border-white/10 text-gray-500 hover:text-white"}`}>
              <Filter className="w-3 h-3" />
              {selectedGroups.size > 0 ? `${selectedGroups.size} grup secili` : "Grup Sec"}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showGroupPicker && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-[#0d0d18] border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 max-h-[400px] overflow-hidden">
                <div className="p-2 border-b border-white/5">
                  <div className="relative">
                    <Search className="absolute left-2 top-1.5 w-3 h-3 text-gray-600" />
                    <input type="text" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Grup ara..."
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none" />
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={() => setSelectedGroups(new Set(filteredPickerGroups.map(g => g.id)))} className="text-[9px] text-blue-400 hover:text-blue-300">Tumunu Sec</button>
                    <span className="text-gray-700">|</span>
                    <button onClick={() => setSelectedGroups(new Set())} className="text-[9px] text-gray-400 hover:text-white">Temizle</button>
                    <span className="text-gray-700">|</span>
                    <button onClick={() => setShowGroupPicker(false)} className="text-[9px] text-gray-400 hover:text-white ml-auto">Kapat</button>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[300px] p-1">
                  {Object.entries(groupsByBrand).filter(([b]) => selectedBrand === "all" || b === selectedBrand).map(([brand, groups]) => {
                    const filtered = groups.filter(g => !groupSearch || g.title.toLowerCase().includes(groupSearch.toLowerCase()));
                    if (filtered.length === 0) return null;
                    return (
                      <div key={brand}>
                        <button onClick={() => {
                          const ids = filtered.map(g => g.id);
                          const allSelected = ids.every(id => selectedGroups.has(id));
                          const next = new Set(selectedGroups);
                          ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
                          setSelectedGroups(next);
                        }} className={`w-full text-left px-2 py-1.5 text-[10px] font-bold ${BRAND_COLORS[brand]?.text || "text-gray-400"} hover:bg-white/5 rounded flex items-center justify-between`}>
                          {brand} ({filtered.length})
                          {filtered.every(g => selectedGroups.has(g.id)) && <Check className="w-3 h-3" />}
                        </button>
                        {filtered.map(g => (
                          <button key={g.id} onClick={() => { const n = new Set(selectedGroups); n.has(g.id) ? n.delete(g.id) : n.add(g.id); setSelectedGroups(n); }}
                            className={`w-full text-left px-4 py-1 text-[10px] hover:bg-white/5 rounded flex items-center gap-2 ${selectedGroups.has(g.id) ? "text-white" : "text-gray-500"}`}>
                            <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${selectedGroups.has(g.id) ? "bg-violet-600 border-violet-500" : "border-gray-700"}`}>
                              {selectedGroups.has(g.id) && <Check className="w-2 h-2" />}
                            </div>
                            <span className="truncate">{g.title}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {selectedGroups.size > 0 && (
            <button onClick={() => setSelectedGroups(new Set())} className="text-[10px] text-gray-500 hover:text-white">Filtreyi Temizle</button>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /></div>}

      {/* ===== GENEL BAKIS ===== */}
      {!loading && data && tab === "overview" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">{data.dateLabel}{selectedBrand !== "all" ? ` · ${selectedBrand}` : ""}</p>

          {/* Sayaclar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4 text-center">
              <MessageSquare className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-2xl font-black">{data.totalMsg}</p>
              <p className="text-[9px] text-gray-500 uppercase">Mesaj</p>
            </div>
            <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4 text-center">
              <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-black text-red-400">{data.totalAlert}</p>
              <p className="text-[9px] text-gray-500 uppercase">Uyari</p>
            </div>
            <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4 text-center">
              <Clock className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-2xl font-black text-amber-400">{data.totalTopic}</p>
              <p className="text-[9px] text-gray-500 uppercase">Konu</p>
            </div>
          </div>

          {/* Marka karti */}
          {data.brands.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {data.brands.filter(b => selectedBrand === "all" || b.brand === selectedBrand).map(b => (
                <div key={b.brand} className="bg-[#0d0d18] rounded-xl border border-white/5 p-3.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${BRAND_COLORS[b.brand]?.bg || "bg-gray-500"}`} />
                    <span className={`text-xs font-bold ${BRAND_COLORS[b.brand]?.text || ""}`}>{b.brand}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div><p className="text-sm font-black text-red-400">{b.sorun}</p><p className="text-[8px] text-gray-600">Sorun</p></div>
                    <div><p className="text-sm font-black">{b.toplam}</p><p className="text-[8px] text-gray-600">Konu</p></div>
                    <div><p className="text-sm font-black text-gray-400">{b.groups}</p><p className="text-[8px] text-gray-600">Grup</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sorunlu Gruplar */}
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />Sorunlu Gruplar</h2>
            <div className="space-y-2">
              {filteredGroups.filter(g => g.sorun > 0).map(g => (
                <div key={g.id} className="flex items-center gap-3 p-2 bg-white/[0.02] rounded-lg">
                  <div className="bg-red-500/10 text-red-400 text-xs font-bold px-2 py-1 rounded">{g.sorun}</div>
                  <div className={`w-1.5 h-8 rounded-full ${BRAND_COLORS[g.brand]?.bg || "bg-gray-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium truncate">{g.title}</p>
                      <span className={`text-[8px] font-bold ${BRAND_COLORS[g.brand]?.text || ""}`}>{g.brand}</span>
                    </div>
                    {g.top_issues.slice(0, 2).map((issue, i) => (
                      <p key={i} className="text-[10px] text-gray-500 truncate">· {issue}</p>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-600">{g.toplam} konu</span>
                </div>
              ))}
              {filteredGroups.filter(g => g.sorun > 0).length === 0 && <p className="text-xs text-gray-600">Bu donemde sorun yok</p>}
            </div>
          </div>

          {/* Personel */}
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" />En Aktif Personel</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {filteredPersonnel.slice(0, 15).map((p, i) => (
                <div key={p.name} className="flex items-center gap-2 p-2 bg-white/[0.02] rounded-lg">
                  <span className="text-[10px] text-gray-600 w-4">{i+1}.</span>
                  <div className={`w-1.5 h-4 rounded-full ${BRAND_COLORS[p.brand]?.bg || "bg-gray-600"}`} />
                  <span className="text-xs truncate flex-1">{p.name}</span>
                  <span className="text-[10px] text-gray-500">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== MARKA DETAY ===== */}
      {!loading && data && tab === "brand" && (
        <div className="space-y-4">
          {data.brands.filter(b => selectedBrand === "all" || b.brand === selectedBrand).map(brand => {
            const bGroups = data.groups.filter(g => g.brand === brand.brand).sort((a, b) => b.sorun - a.sorun);
            const isExp = expandedBrand === brand.brand;
            return (
              <div key={brand.brand} className="bg-[#0d0d18] rounded-xl border border-white/5 overflow-hidden">
                <button onClick={() => setExpandedBrand(isExp ? null : brand.brand)} className="w-full p-4 flex items-center gap-3 hover:bg-white/[0.02]">
                  <div className={`w-3 h-10 rounded-full ${BRAND_COLORS[brand.brand]?.bg || "bg-gray-500"}`} />
                  <div className="flex-1 text-left">
                    <h3 className={`text-base font-bold ${BRAND_COLORS[brand.brand]?.text || ""}`}>{brand.brand}</h3>
                    <p className="text-[10px] text-gray-500">{brand.groups} grup · {brand.toplam} konu · {brand.sorun} sorun</p>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div><p className="text-lg font-black text-red-400">{brand.sorun}</p><p className="text-[8px] text-gray-600">Sorun</p></div>
                    <div><p className="text-lg font-black">{brand.toplam}</p><p className="text-[8px] text-gray-600">Konu</p></div>
                    <div><p className="text-lg font-black text-gray-400">{brand.groups}</p><p className="text-[8px] text-gray-600">Grup</p></div>
                  </div>
                  {isExp ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                </button>

                {isExp && (
                  <div className="border-t border-white/5 p-4 space-y-2">
                    {bGroups.length === 0 ? <p className="text-xs text-gray-600">Bu donemde konu yok</p> : bGroups.map(g => (
                      <div key={g.id} className="flex items-center gap-3 p-2.5 bg-white/[0.02] rounded-lg">
                        {g.sorun > 0 ? <div className="bg-red-500/10 text-red-400 text-xs font-bold px-2 py-1 rounded min-w-[28px] text-center">{g.sorun}</div>
                          : <div className="bg-green-500/10 text-green-400 text-xs font-bold px-2 py-1 rounded min-w-[28px] text-center">0</div>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{g.title}</p>
                          {g.top_issues.slice(0, 3).map((issue, i) => (
                            <p key={i} className="text-[10px] text-gray-500 truncate">· {issue}</p>
                          ))}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-500">{g.toplam} konu</p>
                          <p className="text-[10px] text-gray-600">{g.msgCount} mesaj</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== AI RAPOR ===== */}
      {tab === "ai" && (() => {
        const aiBrand = selectedBrand;
        const aiGroups = selectedGroups;
        const aiGroupList = allGroups.filter(g => {
          if (aiBrand !== "all" && g.brand !== aiBrand) return false;
          if (aiGroups.size > 0 && !aiGroups.has(g.id)) return false;
          return true;
        });
        const aiSelectedNames = aiGroups.size > 0 ? allGroups.filter(g => aiGroups.has(g.id)).map(g => g.title) : [];

        return (
        <div className="space-y-4">
          {/* ADIM 1: Marka Sec */}
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white">1</div>
              <h2 className="text-sm font-semibold">Marka Sec</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              {["all", "BIA", "Benjabet", "Dilbet", "Dopamin"].map(b => (
                <button key={b} onClick={() => { setSelectedBrand(b); setSelectedGroups(new Set()); }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${selectedBrand === b
                    ? (b === "all" ? "bg-blue-600 text-white ring-2 ring-blue-400/30" : `${BRAND_COLORS[b]?.bg || "bg-gray-500"} text-white ring-2 ring-white/20`)
                    : "bg-white/5 text-gray-500 hover:text-white hover:bg-white/10"}`}>
                  {b === "all" ? "Tum Markalar" : b}
                </button>
              ))}
            </div>
          </div>

          {/* ADIM 2: Grup Sec */}
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white">2</div>
              <h2 className="text-sm font-semibold">Gruplar{selectedBrand !== "all" ? ` (${selectedBrand})` : ""}</h2>
              <span className="text-[10px] text-gray-500 ml-auto">{aiGroups.size > 0 ? `${aiGroups.size} secili` : "Tum gruplar"}</span>
            </div>

            {/* Hizli secimler */}
            <div className="flex gap-1.5 mb-3 flex-wrap">
              <button onClick={() => setSelectedGroups(new Set())} className={`px-3 py-1 rounded-lg text-[10px] font-medium ${aiGroups.size === 0 ? "bg-blue-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>Tum Gruplar</button>
              {aiBrand !== "all" && (
                <button onClick={() => setSelectedGroups(new Set(allGroups.filter(g => g.brand === aiBrand).map(g => g.id)))}
                  className="px-3 py-1 rounded-lg text-[10px] font-medium bg-white/5 text-gray-500 hover:text-white">
                  Tum {aiBrand} Gruplari
                </button>
              )}
              {["Finans", "Chat", "Risk", "Cekim", "Marketing", "Call"].map(kw => {
                const matching = allGroups.filter(g => {
                  if (aiBrand !== "all" && g.brand !== aiBrand) return false;
                  return g.title.toLowerCase().includes(kw.toLowerCase());
                });
                if (matching.length === 0) return null;
                return (
                  <button key={kw} onClick={() => setSelectedGroups(new Set(matching.map(g => g.id)))}
                    className="px-3 py-1 rounded-lg text-[10px] font-medium bg-white/5 text-gray-500 hover:text-white">
                    {kw} ({matching.length})
                  </button>
                );
              })}
            </div>

            {/* Grup listesi */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2 w-3 h-3 text-gray-600" />
              <input type="text" value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Grup ara..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[10px] text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50" />
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-0.5 pr-1">
              {allGroups.filter(g => {
                if (aiBrand !== "all" && g.brand !== aiBrand) return false;
                if (groupSearch && !g.title.toLowerCase().includes(groupSearch.toLowerCase())) return false;
                return true;
              }).map(g => (
                <button key={g.id} onClick={() => { const n = new Set(selectedGroups); n.has(g.id) ? n.delete(g.id) : n.add(g.id); setSelectedGroups(n); }}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-2 transition-all ${aiGroups.has(g.id) ? "bg-violet-600/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"}`}>
                  <div className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${aiGroups.has(g.id) ? "bg-violet-600 border-violet-500" : "border-gray-700"}`}>
                    {aiGroups.has(g.id) && <Check className="w-2 h-2" />}
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${BRAND_COLORS[g.brand]?.bg || "bg-gray-600"}`} />
                  <span className="truncate">{g.title}</span>
                </button>
              ))}
            </div>

            {/* Secili grup ozeti */}
            {aiGroups.size > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {aiSelectedNames.slice(0, 8).map(n => (
                  <span key={n} className="text-[9px] bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full truncate max-w-[150px]">{n}</span>
                ))}
                {aiSelectedNames.length > 8 && <span className="text-[9px] text-gray-500">+{aiSelectedNames.length - 8} daha</span>}
              </div>
            )}
          </div>

          {/* ADIM 3: Komut Ver */}
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-black text-white">3</div>
              <h2 className="text-sm font-semibold">Ne Raporlayayim?</h2>
            </div>

            {/* Ozet */}
            <div className="bg-white/[0.02] rounded-lg p-2.5 mb-3 flex items-center gap-3 text-[10px] text-gray-400">
              <span><b className="text-gray-300">Tarih:</b> {data?.dateLabel || dateMode}</span>
              <span className="text-gray-700">|</span>
              <span><b className="text-gray-300">Marka:</b> {aiBrand === "all" ? "Tumu" : aiBrand}</span>
              <span className="text-gray-700">|</span>
              <span><b className="text-gray-300">Grup:</b> {aiGroups.size > 0 ? `${aiGroups.size} secili` : "Tumu"}</span>
            </div>

            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} rows={3}
              placeholder="Ornek: Bu gruplarda bugün ne oldu? Sorunlar neler, kim ne yapti, aksiyonlar ne olmali?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs resize-none placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />

            {/* Hazir komutlar */}
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[
                "Sorunlari ve aksiyonlari ozetle",
                "Personel performansini analiz et",
                "Cekim ve odeme durumu",
                "Musteri sikayetleri",
                "Cozulmemis sorunlar",
                "Risk ve fraud analizi",
              ].map(ex => (
                <button key={ex} onClick={() => setCustomPrompt(ex)} className="px-2.5 py-1 rounded-lg text-[9px] bg-white/5 text-gray-500 hover:text-white hover:bg-white/10">{ex}</button>
              ))}
            </div>

            <button onClick={generateAIReport} disabled={generating || !customPrompt.trim()}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 rounded-xl text-sm font-semibold transition-all">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {generating ? "AI Hazirlaniyor..." : "Rapor Olustur"}
            </button>
          </div>

          {/* Sonuc */}
          {customResult && (
            <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">AI Rapor</h2>
                <button onClick={() => exportWord(`<pre style="font-family:Calibri;white-space:pre-wrap">${customResult}</pre>`, `ai-rapor-${aiBrand !== "all" ? aiBrand + "-" : ""}${new Date().toISOString().slice(0, 10)}.doc`)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs"><Download className="w-3 h-3" />Word</button>
              </div>
              <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap text-gray-300">{customResult}</div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Oto Yanit Raporu */}
      {tab === "autoreply" && (
        <AutoReplyReport />
      )}

    </div>
  );
}
