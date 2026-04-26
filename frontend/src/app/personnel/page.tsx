"use client";

import { useEffect, useState } from "react";
import { Users, Search, Check, Calendar, Send, Download, Loader2, RefreshCw, UserCheck, MessageSquare, Clock, X, Eye, EyeOff, Play, Square, FileText } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { formatDateIST } from "@/lib/utils";

interface Person {
  sender_name: string;
  sender_id: number;
  msg_count: number;
  groups: string[];
  last_active: string;
}

interface WatchSession {
  id: number;
  keyword: string;
  created_at: string;
}

function toLocalDate(d: Date): string { return d.toISOString().slice(0, 10); }

function getBrand(t: string): string {
  const l = t.toLowerCase().replace(/\u0130/g, "i");
  if (/bia|biabet|livebia/.test(l)) return "BIA";
  if (/benja|benjabet|livebenja|bnj/.test(l)) return "Benjabet";
  if (/dil|dilbet|dilrulet/.test(l)) return "Dilbet";
  if (/dopamin/.test(l)) return "Dopamin";
  return "";
}

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa ${m % 60} dk`;
  return `${Math.floor(h / 24)} gun ${h % 24} sa`;
}

const BRAND_DOT: Record<string, string> = { BIA: "bg-purple-500", Benjabet: "bg-emerald-500", Dilbet: "bg-cyan-500", Dopamin: "bg-pink-500" };

export default function PersonnelPage() {
  const [personnel, setPersonnel] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Geriye donuk rapor
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dateStart, setDateStart] = useState(toLocalDate(new Date()));
  const [dateEnd, setDateEnd] = useState(toLocalDate(new Date()));
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState("");

  // Canli dinleme
  const [watched, setWatched] = useState<WatchSession[]>([]);
  const [stopPrompt, setStopPrompt] = useState<Record<number, string>>({});
  const [stoppingId, setStoppingId] = useState<number | null>(null);
  const [stopReport, setStopReport] = useState<Record<number, string>>({});

  // Saved reports from DB
  const [savedReports, setSavedReports] = useState<{id: number; personnel_name: string; report_type: string; report_content: string; prompt: string; duration: string; message_count: number; created_at: string}[]>([]);
  const [generatingLive, setGeneratingLive] = useState<number | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"live" | "report">("live");
  const [preview, setPreview] = useState<{ name: string; messages: { text: string; date: string; group: string }[] } | null>(null);
  const { toast } = useToast();

  const loadPersonnel = async () => {
    const uid = getUserId();
    try {
      const res = await fetch(`/api/personnel/list?user_id=${uid}`);
      const data = await res.json();
      setPersonnel((data.personnel || []) as Person[]);
    } catch {
      // Fallback: direkt supabase
      const { data } = await supabase.from("messages")
        .select("sender_name,sender_id,date,groups(title)")
        .eq("user_id", uid).neq("sender_name", "Bilinmeyen")
        .order("date", { ascending: false });
      const map: Record<string, Person> = {};
      (data || []).forEach((m: Record<string, unknown>) => {
        const name = m.sender_name as string;
        const group = (m.groups as Record<string, string>)?.title || "";
        if (!map[name]) map[name] = { sender_name: name, sender_id: m.sender_id as number, msg_count: 0, groups: [], last_active: m.date as string };
        map[name].msg_count++;
        if (group && !map[name].groups.includes(group)) map[name].groups.push(group);
      });
      setPersonnel(Object.values(map).sort((a, b) => b.msg_count - a.msg_count));
    }
    setLoading(false);
  };

  const loadWatched = async () => {
    const uid = getUserId();
    const { data } = await supabase.from("keywords").select("id,keyword,created_at")
      .eq("user_id", uid).eq("category", "personnel").eq("is_active", true)
      .order("created_at", { ascending: false });
    setWatched((data || []) as WatchSession[]);
  };

  const loadSavedReports = async () => {
    const uid = getUserId();
    const { data } = await supabase.from("personnel_reports").select("*")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(20);
    setSavedReports((data || []) as typeof savedReports);
  };

  useEffect(() => { loadPersonnel(); loadWatched(); loadSavedReports(); const i = setInterval(loadWatched, 15000); return () => clearInterval(i); }, []);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadPersonnel(), loadWatched()]); toast("Guncellendi"); setRefreshing(false); };

  // Dinlemeye al
  const startWatch = async (name: string) => {
    const uid = getUserId();
    const nameLower = name.toLowerCase();
    const exists = watched.find(w => w.keyword === nameLower);
    if (exists) { toast("Bu kisi zaten dinleniyor", "info"); return; }

    await supabase.from("keywords").insert({ keyword: nameLower, category: "personnel", user_id: uid, is_active: true });
    toast(`${name} dinlemeye alindi`);
    await loadWatched();
  };

  // Rapor al (dinlemeyi durdurmadan)
  const generateLiveReport = async (session: WatchSession) => {
    setGeneratingLive(session.id);
    const uid = getUserId();
    const since = session.created_at;

    const { data: msgs } = await supabase.from("messages")
      .select("text,date,sender_name,groups(title)")
      .eq("user_id", uid).ilike("sender_name", `%${session.keyword}%`)
      .gte("date", since).order("date", { ascending: true });

    const msgList = (msgs || []).map((m: Record<string, unknown>) => ({
      text: m.text as string, date: m.date as string,
      group: (m.groups as Record<string, string>)?.title || "",
      name: m.sender_name as string,
    }));

    const duration = elapsed(since);
    const groupSet = [...new Set(msgList.map(m => m.group))];
    const reportPrompt = stopPrompt[session.id] || "Genel performans raporu";

    const context = `PERSONEL: ${session.keyword}\nDINLEME SURESI: ${duration} (${new Date(since).toLocaleString("tr-TR")} - ${new Date().toLocaleString("tr-TR")})\nAKTIF GRUPLAR: ${groupSet.join(", ")}\nTOPLAM MESAJ: ${msgList.length}\n\nMESAJLAR:\n${msgList.map(m => `[${(m.date || "").slice(11, 16)}] ${m.group} | ${m.name}: ${m.text.slice(0, 200)}`).join("\n")}`;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
          
          
        },
        body: JSON.stringify({
          max_tokens: 4000,
          prompt: `Sen bir personel takip asistanisin.\n\nTALEP: ${reportPrompt}\n\nVERILER:\n${context}\n\nDetayli Turkce rapor hazirla. Kronolojik, somut ornekler ver.`, user_id: getUserId(),
        }),
      });
      const d = await res.json();
      const reportText = d.content || "Rapor olusturulamadi";

      // Save to DB
      await supabase.from("personnel_reports").insert({
        user_id: uid,
        personnel_name: session.keyword,
        report_type: "live",
        report_content: reportText,
        prompt: reportPrompt,
        duration: duration,
        message_count: msgList.length,
        groups: groupSet,
      });

      setStopReport(prev => ({ ...prev, [session.id]: reportText }));
      toast(`${session.keyword} raporu hazir ve kaydedildi`);
      await loadSavedReports();
    } catch {
      toast("Rapor olusturma hatasi", "error");
    }
    setGeneratingLive(null);
  };

  // Rapor ver & durdur
  const stopAndReport = async (session: WatchSession, customPrompt?: string) => {
    setStoppingId(session.id);
    const uid = getUserId();
    const since = session.created_at;

    // O kisinin dinleme basladigindan beri tum mesajlarini cek
    const { data: msgs } = await supabase.from("messages")
      .select("text,date,sender_name,groups(title)")
      .eq("user_id", uid).ilike("sender_name", `%${session.keyword}%`)
      .gte("date", since).order("date", { ascending: true });

    const msgList = (msgs || []).map((m: Record<string, unknown>) => ({
      text: m.text as string, date: m.date as string,
      group: (m.groups as Record<string, string>)?.title || "",
      name: m.sender_name as string,
    }));

    const duration = elapsed(since);
    const groupSet = [...new Set(msgList.map(m => m.group))];

    const reportPrompt = customPrompt || stopPrompt[session.id] || "Bu personelin dinleme surecindeki tum aktivitesini raporla. Ne yapti, nasil calisir, performansi nasil?";

    const context = `PERSONEL: ${session.keyword}
DINLEME SURESI: ${duration} (${new Date(since).toLocaleString("tr-TR")} - ${new Date().toLocaleString("tr-TR")})
AKTIF GRUPLAR: ${groupSet.join(", ")}
TOPLAM MESAJ: ${msgList.length}

MESAJLAR:
${msgList.map(m => `[${(m.date || "").slice(11, 16)}] ${m.group} | ${m.name}: ${m.text.slice(0, 200)}`).join("\n")}`;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          
          
          
        },
        body: JSON.stringify({
          max_tokens: 4000,
          prompt: `Sen bir personel takip asistanisin. Yonetici bir personeli belirli bir sure dinlemeye almis ve simdi rapor istiyor.\n\nYONETICININ TALEBI: ${reportPrompt}\n\nVERILER:\n${context}\n\nDetayli Turkce rapor hazirla. Kronolojik olarak ne yaptigini anlat. Olumlu/olumsuz degerlendirme yap. Somut ornekler ver.`, user_id: getUserId(),
        }),
      });
      const d = await res.json();
      const reportText = d.content || "Rapor olusturulamadi";
      setStopReport(prev => ({ ...prev, [session.id]: reportText }));

      // Save to DB
      const uid2 = getUserId();
      await supabase.from("personnel_reports").insert({
        user_id: uid2,
        personnel_name: session.keyword,
        report_type: "stop",
        report_content: reportText,
        prompt: reportPrompt,
        duration: duration,
        message_count: msgList.length,
        groups: groupSet,
      });
      await loadSavedReports();
      toast(`${session.keyword} raporu hazir ve kaydedildi`);
    } catch {
      setStopReport(prev => ({ ...prev, [session.id]: "Hata: API baglantisi kurulamadi" }));
    }

    // Dinlemeyi kapat
    await supabase.from("keywords").delete().eq("id", session.id);
    setStoppingId(null);
    await loadWatched();
  };

  // Dinlemeyi raporsuz durdur
  const cancelWatch = async (session: WatchSession) => {
    await supabase.from("keywords").delete().eq("id", session.id);
    toast(`${session.keyword} dinlemesi durduruldu`);
    await loadWatched();
  };

  // Geriye donuk rapor
  const generateRetroReport = async () => {
    if (selected.size === 0 || !prompt.trim()) return;
    setGenerating(true); setReport("");
    const uid = getUserId();
    const s = new Date(dateStart); s.setHours(0, 0, 0, 0);
    const e = new Date(dateEnd); e.setHours(23, 59, 59, 999);
    const names = Array.from(selected);

    let allMsgs: { name: string; text: string; date: string; group: string }[] = [];
    for (const name of names) {
      const { data } = await supabase.from("messages")
        .select("text,date,sender_name,groups(title)")
        .eq("user_id", uid).eq("sender_name", name)
        .gte("date", s.toISOString()).lte("date", e.toISOString())
        .order("date", { ascending: true });
      (data || []).forEach((m: Record<string, unknown>) => {
        allMsgs.push({ name: m.sender_name as string, text: m.text as string, date: m.date as string, group: (m.groups as Record<string, string>)?.title || "" });
      });
    }

    const context = `PERSONEL: ${names.join(", ")}\nTARIH: ${s.toLocaleDateString("tr-TR")} - ${e.toLocaleDateString("tr-TR")}\nTOPLAM MESAJ: ${allMsgs.length}\n\nMESAJLAR:\n${allMsgs.slice(0, 300).map(m => `[${(m.date || "").slice(11, 16)}] ${m.group} | ${m.name}: ${m.text.slice(0, 150)}`).join("\n")}`;

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json",    },
        body: JSON.stringify({ max_tokens: 4000,
          prompt: `Sen bir personel analiz asistanisin.\n\nTALEP: ${prompt}\n\nVERILER:\n${context}\n\nDetayli Turkce rapor hazirla. Her personel icin ayri degerlendirme yap.`, user_id: getUserId() }),
      });
      const d = await res.json();
      const retroText = d.content || "Rapor olusturulamadi";
      setReport(retroText);

      // Save to DB
      await supabase.from("personnel_reports").insert({
        user_id: uid,
        personnel_name: names.join(", "),
        report_type: "retro",
        report_content: retroText,
        prompt: prompt,
        duration: dateStart + " - " + dateEnd,
        message_count: allMsgs.length,
      });
      await loadSavedReports();
      toast("Rapor hazir ve kaydedildi");
    } catch { setReport("Hata: API baglantisi kurulamadi"); }
    setGenerating(false);
  };

  const exportWord = (content: string, filename: string) => {
    const html = `<html><head><meta charset='utf-8'><style>body{font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;color:#333}h1{color:#1a1a2e;font-size:18pt;border-bottom:2px solid #1a1a2e}h2{color:#2c3e50;font-size:14pt}</style></head><body><pre style="font-family:Calibri;white-space:pre-wrap">${content}</pre></body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    toast("Word indirildi");
  };

  const previewPerson = async (name: string) => {
    const uid = getUserId();
    const { data } = await supabase.from("messages").select("text,date,groups(title)")
      .eq("user_id", uid).eq("sender_name", name).order("date", { ascending: false }).limit(30);
    setPreview({ name, messages: (data || []).map((m: Record<string, unknown>) => ({ text: m.text as string, date: m.date as string, group: (m.groups as Record<string, string>)?.title || "" })) });
  };

  const filtered = personnel.filter(p => p.sender_name.toLowerCase().includes(search.toLowerCase()) || p.groups.some(g => g.toLowerCase().includes(search.toLowerCase())));
  const isWatched = (name: string) => watched.some(w => w.keyword === name.toLowerCase());

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCheck className="w-6 h-6 text-indigo-400" />Personel Takip</h1>
        <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50"><RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        <button onClick={() => setTab("live")} className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${tab === "live" ? "bg-red-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>
          <Eye className="w-3.5 h-3.5" />Canli Dinleme {watched.length > 0 && <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-[9px]">{watched.length}</span>}
        </button>
        <button onClick={() => setTab("report")} className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${tab === "report" ? "bg-indigo-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>
          <FileText className="w-3.5 h-3.5" />Gecmis Rapor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* SOL: Personel Listesi */}
        <div className="lg:col-span-1 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-600" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Personel veya grup ara..."
              className="w-full bg-[#0d0d18] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/50" />
          </div>

          <div className="bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              {filtered.map(p => {
                const watching = isWatched(p.sender_name);
                const isSel = selected.has(p.sender_name);
                const topBrand = p.groups.map(g => getBrand(g)).find(b => b) || "";
                return (
                  <div key={p.sender_name}
                    className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5 transition-all ${watching ? "bg-red-500/5 border-l-2 border-l-red-500" : ""} ${isSel ? "bg-indigo-600/10" : "hover:bg-white/[0.03]"}`}>
                    {/* Checkbox (gecmis rapor modunda) */}
                    {tab === "report" && (
                      <button onClick={() => { const n = new Set(selected); n.has(p.sender_name) ? n.delete(p.sender_name) : n.add(p.sender_name); setSelected(n); }}
                        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${isSel ? "bg-indigo-600 border-indigo-500" : "border-gray-700"}`}>
                        {isSel && <Check className="w-2.5 h-2.5" />}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {topBrand && <div className={`w-1.5 h-1.5 rounded-full ${BRAND_DOT[topBrand] || "bg-gray-600"}`} />}
                        <span className="text-xs font-medium truncate">{p.sender_name}</span>
                        {watching && <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      </div>
                      <p className="text-[9px] text-gray-600 truncate">{p.groups.slice(0, 3).join(", ")}</p>
                    </div>
                    <span className="text-[10px] text-gray-600">{p.msg_count}</span>
                    {/* Dinlemeye al / mesaj */}
                    {tab === "live" && (
                      <button onClick={() => watching ? cancelWatch(watched.find(w => w.keyword === p.sender_name.toLowerCase())!) : startWatch(p.sender_name)}
                        className={`p-1.5 rounded-lg text-[9px] font-medium flex items-center gap-1 ${watching ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-white/5 text-gray-500 hover:text-green-400 hover:bg-green-500/10"}`}>
                        {watching ? <><Square className="w-3 h-3" />Durdur</> : <><Play className="w-3 h-3" />Dinle</>}
                      </button>
                    )}
                    <button onClick={() => previewPerson(p.sender_name)} className="p-1 text-gray-700 hover:text-indigo-400"><MessageSquare className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SAG */}
        <div className="lg:col-span-2 space-y-4">
          {/* ===== CANLI DINLEME ===== */}
          {tab === "live" && (
            <>
              {watched.length === 0 ? (
                <div className="bg-[#0d0d18] rounded-2xl border border-white/5 p-8 text-center">
                  <EyeOff className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Dinlenen personel yok</p>
                  <p className="text-[10px] text-gray-600 mt-1">Soldaki listeden birini secip "Dinle" butonuna basin</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {watched.map(session => {
                    const hasReport = !!stopReport[session.id];
                    return (
                      <div key={session.id} className="bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden">
                        {/* Header */}
                        <div className="p-4 flex items-center gap-3 border-b border-white/5">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <div className="flex-1">
                            <h3 className="text-sm font-bold capitalize">{session.keyword}</h3>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1"><Clock className="w-2.5 h-2.5" />Dinleme suresi: {elapsed(session.created_at)} · Baslangic: {formatDateIST(session.created_at)}</p>
                          </div>
                          <button onClick={() => cancelWatch(session)} className="text-[10px] text-gray-600 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10">Iptal</button>
                        </div>

                        {/* Rapor prompt + buton */}
                        <div className="p-4 space-y-3">
                          <div>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Rapor Talebi</span>
                            <textarea value={stopPrompt[session.id] || ""} onChange={e => setStopPrompt(prev => ({ ...prev, [session.id]: e.target.value }))} rows={2}
                              placeholder="Ornek: Bu kisi ne yapti, nasil calisir, performansi nasil? Musteri sorunlarina nasil yaklasti?"
                              className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs resize-none placeholder-gray-600 focus:outline-none focus:border-red-500/50" />
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {["Genel performans raporu", "Musteri iletisim kalitesi", "Sorun cozme analizi", "Ne kadar aktif calisir", "Eksik yonleri ve gelistirme onerileri"].map(ex => (
                                <button key={ex} onClick={() => setStopPrompt(prev => ({ ...prev, [session.id]: ex }))} className="px-2 py-0.5 rounded text-[9px] bg-white/5 text-gray-500 hover:text-white">{ex}</button>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button onClick={() => generateLiveReport(session)} disabled={generatingLive === session.id || stoppingId === session.id}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 rounded-xl text-sm font-semibold transition-all">
                              {generatingLive === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                              {generatingLive === session.id ? "Hazirlaniyor..." : "Rapor Al"}
                            </button>
                            <button onClick={() => stopAndReport(session)} disabled={stoppingId === session.id || generatingLive === session.id}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-gray-800 rounded-xl text-sm font-semibold transition-all">
                              {stoppingId === session.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                              {stoppingId === session.id ? "Durduruluyor..." : "Durdur & Rapor Ver"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Tamamlanan raporlar */}
                  {Object.entries(stopReport).map(([idStr, rpt]) => {
                    if (!rpt) return null;
                    const id = parseInt(idStr);
                    return (
                      <div key={id} className="bg-[#0d0d18] rounded-2xl border border-green-500/20 p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-green-400" />Dinleme Raporu</h3>
                          <div className="flex gap-1.5">
                            <button onClick={() => exportWord(rpt, `dinleme-rapor-${new Date().toISOString().slice(0, 10)}.doc`)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs"><Download className="w-3 h-3" />Word</button>
                            <button onClick={() => setStopReport(prev => { const n = { ...prev }; delete n[id]; return n; })} className="text-gray-600 hover:text-white p-1"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                        <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap text-gray-300">{rpt}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Kayitli Raporlar */}
          {savedReports.filter(r => r.report_type === "live" || r.report_type === "stop").length > 0 && tab === "live" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dinleme Raporlari ({savedReports.filter(r => r.report_type === "live" || r.report_type === "stop").length})</h3>
              {savedReports.filter(r => r.report_type === "live" || r.report_type === "stop").map(r => (
                <div key={r.id} className="bg-[#0d0d18] rounded-2xl border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold capitalize">{r.personnel_name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${r.report_type === "stop" ? "bg-red-500/10 text-red-400" : "bg-indigo-500/10 text-indigo-400"}`}>
                        {r.report_type === "stop" ? "Durdurma" : "Canli"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-600">{r.duration} · {r.message_count} mesaj</span>
                      <span className="text-[9px] text-gray-600">{new Date(r.created_at).toLocaleDateString("tr-TR")}</span>
                      <button onClick={() => exportWord(r.report_content, `rapor-${r.personnel_name}-${new Date(r.created_at).toISOString().slice(0, 10)}.doc`)} className="p-1 text-gray-600 hover:text-indigo-400"><Download className="w-3 h-3" /></button>
                      <button onClick={async () => { await supabase.from("personnel_reports").delete().eq("id", r.id); await loadSavedReports(); toast("Rapor silindi"); }} className="p-1 text-gray-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer text-[10px] text-gray-500 hover:text-white">Raporu goster</summary>
                    <div className="mt-2 prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap text-gray-300">{r.report_content}</div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* ===== GECMIS RAPOR ===== */}
          {tab === "report" && (
            <div className="space-y-4">
              <div className="bg-[#0d0d18] rounded-2xl border border-white/5 p-5 space-y-4">
                {selected.size > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Secili Personel</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Array.from(selected).map(name => (
                        <span key={name} className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded-full">
                          {name}<button onClick={() => { const n = new Set(selected); n.delete(name); setSelected(n); }}><X className="w-2.5 h-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Tarih Araligi</span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none" />
                    <span className="text-gray-600">-</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none" />
                    <div className="flex gap-1 ml-2">
                      {[{ l: "Bugun", fn: () => { const d = toLocalDate(new Date()); setDateStart(d); setDateEnd(d); } },
                        { l: "Dun", fn: () => { const d = new Date(); d.setDate(d.getDate()-1); const s = toLocalDate(d); setDateStart(s); setDateEnd(s); } },
                        { l: "7G", fn: () => { const d = new Date(); d.setDate(d.getDate()-7); setDateStart(toLocalDate(d)); setDateEnd(toLocalDate(new Date())); } },
                        { l: "30G", fn: () => { const d = new Date(); d.setDate(d.getDate()-30); setDateStart(toLocalDate(d)); setDateEnd(toLocalDate(new Date())); } },
                      ].map(b => (<button key={b.l} onClick={b.fn} className="px-2 py-1 rounded text-[9px] bg-white/5 text-gray-500 hover:text-white">{b.l}</button>))}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Rapor Talebi</span>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                    placeholder="Ornek: Bu personellerin performansini karsilastir, kim daha aktif, kim sorun cozmus..."
                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs resize-none placeholder-gray-600 focus:outline-none focus:border-indigo-500/50" />
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {["Performans analizi", "Mesai saatleri analizi", "Musteri iletisim kalitesi", "Sorun cozme becerisi", "Karsilastirmali analiz"].map(ex => (
                      <button key={ex} onClick={() => setPrompt(ex)} className="px-2 py-1 rounded text-[9px] bg-white/5 text-gray-500 hover:text-white">{ex}</button>
                    ))}
                  </div>
                </div>

                <button onClick={generateRetroReport} disabled={generating || selected.size === 0 || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 rounded-xl text-sm font-semibold">
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {generating ? "Hazirlaniyor..." : `Rapor Olustur (${selected.size} kisi)`}
                </button>
              </div>

              {report && (
                <div className="bg-[#0d0d18] rounded-2xl border border-white/5 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold">Personel Raporu</h2>
                    <button onClick={() => exportWord(report, `personel-rapor-${dateStart}.doc`)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs"><Download className="w-3 h-3" />Word</button>
                  </div>
                  <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap text-gray-300">{report}</div>
                </div>
              )}
            </div>
          )}

          {/* Kayitli Gecmis Raporlar */}
          {savedReports.filter(r => r.report_type === "retro").length > 0 && tab === "report" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gecmis Raporlar ({savedReports.filter(r => r.report_type === "retro").length})</h3>
              {savedReports.filter(r => r.report_type === "retro").map(r => (
                <div key={r.id} className="bg-[#0d0d18] rounded-2xl border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold capitalize">{r.personnel_name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">Gecmis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-600">{r.duration} · {r.message_count} mesaj</span>
                      <span className="text-[9px] text-gray-600">{new Date(r.created_at).toLocaleDateString("tr-TR")}</span>
                      <button onClick={() => exportWord(r.report_content, `rapor-${r.personnel_name}-${new Date(r.created_at).toISOString().slice(0, 10)}.doc`)} className="p-1 text-gray-600 hover:text-indigo-400"><Download className="w-3 h-3" /></button>
                      <button onClick={async () => { await supabase.from("personnel_reports").delete().eq("id", r.id); await loadSavedReports(); toast("Rapor silindi"); }} className="p-1 text-gray-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                  <details className="text-xs text-gray-400">
                    <summary className="cursor-pointer text-[10px] text-gray-500 hover:text-white">Raporu goster</summary>
                    <div className="mt-2 prose prose-invert prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap text-gray-300">{r.report_content}</div>
                  </details>
                </div>
              ))}
            </div>
          )}

          {/* On Izleme */}
          {preview && (
            <div className="bg-[#0d0d18] rounded-2xl border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4 text-indigo-400" />{preview.name}</h3>
                <button onClick={() => setPreview(null)} className="text-gray-600 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {preview.messages.length === 0 ? <p className="text-xs text-gray-600">Mesaj yok</p> :
                  preview.messages.map((m, i) => (
                    <div key={i} className="flex gap-2 text-[10px]">
                      <span className="text-gray-600 flex-shrink-0 w-10">{m.date.slice(11, 16)}</span>
                      <span className="text-gray-500 flex-shrink-0 truncate max-w-[120px]">{m.group}</span>
                      <span className="text-gray-300 flex-1 truncate">{m.text}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
