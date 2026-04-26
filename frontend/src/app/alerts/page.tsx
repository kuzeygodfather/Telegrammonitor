"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, Send, MessageSquare, User, Clock, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight, Check, Search, Pin, X, StickyNote, AlertTriangle, Activity, Target, ArrowRight, RefreshCw, ExternalLink } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { markAllAlertsRead, sendReply } from "@/lib/api";
import { formatDateIST } from "@/lib/utils";
import { useToast } from "@/components/Toast";

interface Topic { id: number; group_id: number; group_title: string; title: string; status: string; durum: string; urgency: number; summary: string; first_message_at: string; last_message_at: string; message_count: number; last_aksiyon: string; assigned_to: string|null; assigned_to_id: number|null; view_count: number; notes: string|null; messages?: TMsg[]; members?: GMember[]; }
interface TMsg { id: number; sender_name: string; text: string; date: string; telegram_msg_id: number; matched_keywords: string[]; }
interface GMember { sender_name: string; sender_id: number; msg_count: number; }

interface ParsedStory {
  sorun: string;
  kronoloji: string[];
  sonDurum: string;
  aksiyon: string;
  raw: string;
}

function parseStory(summary: string): ParsedStory {
  const result: ParsedStory = { sorun: "", kronoloji: [], sonDurum: "", aksiyon: "", raw: summary || "" };
  if (!summary) return result;

  const lines = summary.split("\n");
  let section = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("SORUN:")) {
      result.sorun = trimmed.substring(6).trim();
      section = "";
    } else if (trimmed === "KRONOLOJI:") {
      section = "kronoloji";
    } else if (trimmed.startsWith("SON DURUM:")) {
      result.sonDurum = trimmed.substring(9).trim();
      section = "";
    } else if (trimmed.startsWith("AKSIYON:")) {
      result.aksiyon = trimmed.substring(8).trim();
      section = "";
    } else if (section === "kronoloji" && trimmed) {
      result.kronoloji.push(trimmed);
    }
  }

  // Eger yapilandirilmis format degilse, tum metni sorun olarak goster
  if (!result.sorun && !result.kronoloji.length && !result.sonDurum) {
    result.sorun = summary;
  }

  return result;
}

function getBrand(t: string): string {
  const l = t.toLowerCase().replace(/İ/g, "i");
  if (/bia|biabet|livebia/.test(l)) return "BIA";
  if (/benja|benjabet|livebenja|bnj/.test(l)) return "Benjabet";
  if (/dil|dilbet|dilrulet/.test(l)) return "Dilbet";
  if (/dopamin/.test(l)) return "Dopamin";
  return "Diger";
}

const DURUM: Record<string, { color: string; bg: string; bgSoft: string; label: string; icon: string }> = {
  SORUN: { color: "text-red-400", bg: "bg-red-500", bgSoft: "bg-red-500/10", label: "SORUN", icon: "🔴" },
  ONAY_BEKLIYOR: { color: "text-amber-400", bg: "bg-amber-500", bgSoft: "bg-amber-500/10", label: "ONAY", icon: "🟡" },
  AKSIYON_GEREKLI: { color: "text-orange-400", bg: "bg-orange-500", bgSoft: "bg-orange-500/10", label: "AKSIYON", icon: "🟠" },
  BILGI: { color: "text-sky-400", bg: "bg-sky-500", bgSoft: "bg-sky-500/10", label: "BILGI", icon: "🔵" },
  RUTIN: { color: "text-gray-500", bg: "bg-gray-600", bgSoft: "bg-gray-500/10", label: "RUTIN", icon: "⚪" },
};

const BRAND_COLOR: Record<string, string> = { BIA: "text-purple-400", Benjabet: "text-emerald-400", Dilbet: "text-cyan-400", Dopamin: "text-pink-400", Diger: "text-gray-400" };

const PP = 15;

export default function AlertsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [durum, setDurum] = useState("all");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState("open");
  const [time, setTime] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"urgency"|"date"|"messages">("urgency");
  const [page, setPage] = useState(1);
  const [exp, setExp] = useState<number|null>(null);
  const [reply, setReply] = useState<Record<number, string>>({});
  const [replyOk, setReplyOk] = useState<Record<number, boolean>>({});
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [selMode, setSelMode] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [showBulkNote, setShowBulkNote] = useState(false);
  const [showBulkDurum, setShowBulkDurum] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState<Record<number, string>>({});
  const [searchIds, setSearchIds] = useState<Set<number>|null>(null);
  const [showMsgs, setShowMsgs] = useState<Record<number, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    const uid = getUserId();
    if (!uid) return;
    // Tum kayitlari sayfalama ile cek (Supabase 1000 limit bypass)
    const PAGE_SIZE = 1000;
    let allData: Record<string, unknown>[] = [];
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase.from("topics").select("*, groups(title)").eq("user_id", uid).order("last_message_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (durum === "sorun") q = q.eq("durum", "SORUN");
      if (durum === "onay") q = q.eq("durum", "ONAY_BEKLIYOR");
      if (durum === "aksiyon") q = q.eq("durum", "AKSIYON_GEREKLI");
      if (durum === "bilgi") q = q.eq("durum", "BILGI");
      if (time !== "all") { const d = new Date(); if (time === "today") d.setHours(0,0,0,0); if (time === "3d") d.setDate(d.getDate()-3); if (time === "7d") d.setDate(d.getDate()-7); q = q.gte("last_message_at", d.toISOString()); }
      const { data: batch } = await q.range(offset, offset + PAGE_SIZE - 1);
      if (!batch || batch.length === 0) break;
      allData = allData.concat(batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    setTopics(prev => {
      const newT = allData.map((t: Record<string, unknown>) => ({...t, group_title: (t.groups as Record<string, string>)?.title??"?"})) as Topic[];
      return newT.map(nt => { const old = prev.find(p => p.id === nt.id); return old?.messages ? {...nt, messages: old.messages, members: old.members} : nt; });
    });
    setLoading(false);
  }, [durum, status, time]);

  const refresh = async () => { setRefreshing(true); await fetchData(); toast("Veriler guncellendi"); setRefreshing(false); };

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const i = setInterval(() => { if (!exp) fetchData(); }, 15000); return () => clearInterval(i); }, [fetchData, exp]);

  // Deep search
  useEffect(() => {
    if (!search || search.length < 2) { setSearchIds(null); return; }
    const t = setTimeout(async () => {
      const uid = getUserId();
      const { data } = await supabase.from("messages").select("topic_id").eq("user_id", uid).or(`sender_name.ilike.%${search}%,text.ilike.%${search}%`).not("topic_id", "is", null);
      setSearchIds(new Set((data||[]).map((r: Record<string, unknown>) => r.topic_id as number).filter(Boolean)));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  let filtered = topics.filter(t => {
    if (brand !== "all" && getBrand(t.group_title) !== brand) return false;
    if (search && search.length >= 2) {
      const s = search.toLowerCase();
      return t.title.toLowerCase().includes(s) || (t.summary||"").toLowerCase().includes(s) || t.group_title.toLowerCase().includes(s) || (t.assigned_to||"").toLowerCase().includes(s) || (searchIds?.has(t.id)||false);
    }
    return true;
  }).sort((a, b) => {
    if (pinned.has(a.id) !== pinned.has(b.id)) return pinned.has(a.id) ? -1 : 1;
    if (sort === "urgency") return b.urgency - a.urgency || new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    if (sort === "date") return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    return b.message_count - a.message_count;
  });

  const tp = Math.ceil(filtered.length / PP);
  const paged = filtered.slice((page-1)*PP, page*PP);
  const [totalCounts, setTotalCounts] = useState({ sorun: 0, onay: 0, aksiyon: 0, bilgi: 0, total: 0 });
  useEffect(() => {
    const fetchCounts = async () => {
      const uid = getUserId();
      if (!uid) return;
      const [s, o, a, b, t] = await Promise.all([
        supabase.from("topics").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "open").eq("durum", "SORUN"),
        supabase.from("topics").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "open").eq("durum", "ONAY_BEKLIYOR"),
        supabase.from("topics").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "open").eq("durum", "AKSIYON_GEREKLI"),
        supabase.from("topics").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "open").eq("durum", "BILGI"),
        supabase.from("topics").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("status", "open"),
      ]);
      setTotalCounts({ sorun: s.count ?? 0, onay: o.count ?? 0, aksiyon: a.count ?? 0, bilgi: b.count ?? 0, total: t.count ?? 0 });
    };
    fetchCounts();
    const i = setInterval(fetchCounts, 30000);
    return () => clearInterval(i);
  }, []);
  const counts = totalCounts;
  const bc: Record<string,number> = {}; topics.forEach(t => { const b=getBrand(t.group_title); bc[b]=(bc[b]||0)+1; });

  const loadM = async (id: number) => {
    const topic = topics.find(t=>t.id===id); if (!topic) return;
    const [{ data: msgs }, { data: members }] = await Promise.all([
      supabase.from("messages").select("id,sender_name,text,date,telegram_msg_id,matched_keywords").eq("topic_id", id).order("date", { ascending: true }),
      supabase.from("messages").select("sender_name,sender_id").eq("group_id", topic.group_id).neq("sender_name", "Bilinmeyen")
    ]);
    const mm: Record<string, GMember> = {};
    (members||[]).forEach((m: Record<string, unknown>) => { const n=m.sender_name as string; if(!mm[n]) mm[n]={sender_name:n,sender_id:m.sender_id as number,msg_count:0}; mm[n].msg_count++; });
    setTopics(p => p.map(t => t.id===id ? {...t, messages: (msgs??[]) as TMsg[], members: Object.values(mm).sort((a,b) => b.msg_count-a.msg_count)} : t));
    supabase.from("topics").update({view_count:(topic.view_count||0)+1}).eq("id",id).then(()=>{});
  };

  const tog = (id: number) => { if (exp===id) { setExp(null); return; } setExp(id); const t=topics.find(x=>x.id===id); if(!t?.messages) loadM(id); };
  const close_ = async (id: number) => { await supabase.from("topics").update({status:"resolved"}).eq("id",id); setTopics(p=>p.filter(t=>t.id!==id)); toast("Konu cozuldu olarak isaretlendi"); };
  const batchClose = async () => { setBulkProcessing(true); for (const id of sel) await supabase.from("topics").update({status:"resolved"}).eq("id",id); setTopics(p=>p.filter(t=>!sel.has(t.id))); setSel(new Set()); setSelMode(false); setBulkProcessing(false); toast(`${sel.size} konu kapatildi`); };
  const batchResolveWithNote = async () => { if (!bulkNote.trim()) return; setBulkProcessing(true); const note = bulkNote.trim(); const now = new Date().toLocaleString("tr-TR", {timeZone:"Europe/Istanbul"}); for (const id of sel) { const t = topics.find(x=>x.id===id); const existing = t?.notes || ""; const updated = existing ? `${existing}\n[${now}] ${note}` : `[${now}] ${note}`; await supabase.from("topics").update({status:"resolved", notes: updated}).eq("id",id); } setTopics(p=>p.filter(t=>!sel.has(t.id))); setSel(new Set()); setSelMode(false); setShowBulkNote(false); setBulkNote(""); setBulkProcessing(false); toast(`${sel.size} konu cozuldu olarak isaretlendi`); };
  const batchAddNote = async () => { if (!bulkNote.trim()) return; setBulkProcessing(true); const note = bulkNote.trim(); const now = new Date().toLocaleString("tr-TR", {timeZone:"Europe/Istanbul"}); for (const id of sel) { const t = topics.find(x=>x.id===id); const existing = t?.notes || ""; const updated = existing ? `${existing}\n[${now}] ${note}` : `[${now}] ${note}`; await supabase.from("topics").update({notes: updated}).eq("id",id); } setTopics(p=>p.map(t=> sel.has(t.id) ? {...t, notes: (t.notes||"") + `\n[${now}] ${note}`} : t)); setBulkNote(""); setShowBulkNote(false); setBulkProcessing(false); toast(`${sel.size} konuya not eklendi`); };
  const batchChangeDurum = async (newDurum: string) => { setBulkProcessing(true); for (const id of sel) await supabase.from("topics").update({durum: newDurum}).eq("id",id); setTopics(p=>p.map(t=> sel.has(t.id) ? {...t, durum: newDurum} : t)); setShowBulkDurum(false); setBulkProcessing(false); toast(`${sel.size} konunun durumu ${newDurum} olarak degistirildi`); };
  const batchReopen = async () => { setBulkProcessing(true); for (const id of sel) await supabase.from("topics").update({status:"open"}).eq("id",id); setTopics(p=>p.map(t=> sel.has(t.id) ? {...t, status:"open"} : t)); setBulkProcessing(false); toast(`${sel.size} konu yeniden acildi`); };
  const assignPerson = async (id: number, name: string, sid: number) => { await supabase.from("topics").update({assigned_to:name,assigned_to_id:sid}).eq("id",id); setTopics(p=>p.map(t=>t.id===id?{...t,assigned_to:name,assigned_to_id:sid}:t)); toast(`${name} atandi`); };
  const saveNote = async (id: number, note: string) => { await supabase.from("topics").update({notes:note}).eq("id",id); setTopics(p=>p.map(t=>t.id===id?{...t,notes:note}:t)); toast("Not kaydedildi"); };
  const doReply = async (t: Topic) => { const txt=reply[t.id]; if(!txt?.trim()) return; const last=t.messages?.[t.messages.length-1]; await sendReply(t.group_id,txt.trim(),last?.telegram_msg_id||undefined); setReply(p=>({...p,[t.id]:""})); toast("Mesaj gonderildi"); };
  const csv = () => { const h="Konu,Grup,Marka,Durum,Oncelik,Mesaj,Atanan,Son,Aksiyon\n"; const r=filtered.map(t=>`"${t.title.replace(/"/g,'""')}","${t.group_title}","${getBrand(t.group_title)}","${t.durum}",${t.urgency},${t.message_count},"${t.assigned_to||''}","${formatDateIST(t.last_message_at)}","${(t.last_aksiyon||'').replace(/"/g,'""')}"`).join("\n"); const b=new Blob(["\uFEFF"+h+r],{type:"text/csv;charset=utf-8;"}); const u=URL.createObjectURL(b); const a=document.createElement("a"); a.href=u; a.download=`tg-monitor-${new Date().toISOString().slice(0,10)}.csv`; a.click(); };
  const pdf = () => { const w=window.open("","_blank"); if(!w) return; w.document.write(`<html><head><title>TG Monitor</title><style>body{font-family:system-ui;padding:30px;color:#1a1a2e}table{border-collapse:collapse;width:100%;font-size:13px}th{background:#1a1a2e;color:#fff;padding:10px;text-align:left}td{padding:8px;border-bottom:1px solid #eee}h1{font-size:22px}h2{color:#888;font-size:13px;font-weight:normal}</style></head><body><h1>Uyari Raporu</h1><h2>${new Date().toLocaleString("tr-TR",{timeZone:"Europe/Istanbul"})} · ${filtered.length} konu</h2><table><tr><th>#</th><th>Durum</th><th>Konu</th><th>Marka</th><th>Grup</th><th>Atanan</th><th>Aksiyon</th></tr>${filtered.map(t=>`<tr><td><b>${t.urgency}/5</b></td><td>${t.durum}</td><td>${t.title}</td><td>${getBrand(t.group_title)}</td><td>${t.group_title}</td><td>${t.assigned_to||'-'}</td><td>${t.last_aksiyon||'-'}</td></tr>`).join("")}</table><script>setTimeout(()=>window.print(),500)<\/script></body></html>`); w.document.close(); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Uyari Merkezi</h1>
          <p className="text-xs text-gray-500 mt-0.5">{filtered.length} acik konu</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={refresh} disabled={refreshing} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />Yenile</button>
          <button onClick={csv} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1"><Download className="w-3 h-3" />CSV</button>
          <button onClick={pdf} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1"><Download className="w-3 h-3" />PDF</button>
          <button onClick={() => setSelMode(!selMode)} className={`h-8 px-2.5 rounded-lg text-[11px] border flex items-center gap-1 ${selMode?"bg-blue-600 border-blue-500":"bg-white/5 border-white/10 hover:bg-white/10"}`}><Check className="w-3 h-3" />Sec</button>
          <button onClick={() => { markAllAlertsRead(); toast("Tum uyarilar okundu"); }} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10">Okundu</button>
        </div>
      </div>

      {selMode && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold text-blue-400">{sel.size} / {filtered.length} secildi</span>
            <div className="h-4 w-px bg-gray-700" />
            <button onClick={() => setSel(new Set(filtered.map(t => t.id)))} className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg text-white">Tumunu Sec</button>
            {sel.size > 0 && <button onClick={() => setSel(new Set())} className="bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-lg text-white">Secimi Temizle</button>}
            {sel.size > 0 && (<>
              <div className="h-4 w-px bg-gray-700" />
              <button onClick={batchClose} disabled={bulkProcessing} className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-lg text-white disabled:opacity-50">Cozuldu ({sel.size})</button>
              <button onClick={() => setShowBulkNote(true)} disabled={bulkProcessing} className="bg-orange-600 hover:bg-orange-500 px-3 py-1 rounded-lg text-white disabled:opacity-50">Not Ekle</button>
              <button onClick={() => setShowBulkNote(true)} disabled={bulkProcessing} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1 rounded-lg text-white disabled:opacity-50">Notla Coz</button>
              <div className="relative">
                <button onClick={() => setShowBulkDurum(!showBulkDurum)} disabled={bulkProcessing} className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded-lg text-white disabled:opacity-50 flex items-center gap-1">Durum Degistir <ChevronDown className="w-3 h-3" /></button>
                {showBulkDurum && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-30 min-w-[160px]">
                    {Object.entries(DURUM).filter(([k]) => k !== "RUTIN").map(([key, val]) => (
                      <button key={key} onClick={() => batchChangeDurum(key)} className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 ${val.color}`}>{val.icon} {val.label}</button>
                    ))}
                  </div>
                )}
              </div>
              {status === "resolved" && <button onClick={batchReopen} disabled={bulkProcessing} className="bg-amber-600 hover:bg-amber-500 px-3 py-1 rounded-lg text-white disabled:opacity-50">Yeniden Ac</button>}
            </>)}
            <button onClick={() => {setSel(new Set()); setSelMode(false); setShowBulkNote(false); setShowBulkDurum(false);}} className="text-gray-400 ml-auto hover:text-white">Iptal</button>
          </div>
          {showBulkNote && sel.size > 0 && (
            <div className="flex gap-2 items-end bg-gray-900/50 rounded-lg p-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 mb-1 block">{sel.size} konuya not ekle</label>
                <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} placeholder="Not yazin..." rows={2} className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" autoFocus />
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={batchResolveWithNote} disabled={!bulkNote.trim() || bulkProcessing} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50 whitespace-nowrap">{bulkProcessing ? "Islem..." : "Notla Coz"}</button>
                <button onClick={batchAddNote} disabled={!bulkNote.trim() || bulkProcessing} className="bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50 whitespace-nowrap">{bulkProcessing ? "Islem..." : "Sadece Not"}</button>
              </div>
            </div>
          )}
          {bulkProcessing && (
            <div className="flex items-center gap-2 text-xs text-blue-300"><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400" /> Islem yapiliyor...</div>
          )}
        </div>
      )}

      {/* ===== SAYAC + FILTRE PANELI ===== */}
      <div className="bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden">
        {/* Sayaclar */}
        <div className="grid grid-cols-5 divide-x divide-white/5">
          {[{k:"all",n:filtered.length,l:"Toplam",c:"text-white"},{k:"sorun",n:counts.sorun,l:"Sorun",c:"text-red-400"},{k:"onay",n:counts.onay,l:"Onay",c:"text-amber-400"},{k:"aksiyon",n:counts.aksiyon,l:"Aksiyon",c:"text-orange-400"},{k:"bilgi",n:counts.bilgi,l:"Bilgi",c:"text-sky-400"}].map(x => (
            <button key={x.k} onClick={() => { setDurum(x.k); setPage(1); }}
              className={`py-3 text-center transition-all ${durum===x.k ? "bg-white/5" : "hover:bg-white/[0.02]"}`}>
              <p className={`text-xl font-black ${x.c}`}>{x.n}</p>
              <p className="text-[9px] text-gray-600 uppercase tracking-widest mt-0.5">{x.l}</p>
              {durum===x.k && <div className="h-0.5 bg-blue-500 mt-2 mx-auto w-8 rounded-full" />}
            </button>
          ))}
        </div>

        {/* Filtre Satiri */}
        <div className="px-4 py-3 border-t border-white/5 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-600" />
            <input type="text" placeholder="Kisi, konu, grup ara..." value={search} onChange={e => {setSearch(e.target.value); setPage(1);}}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20" />
          </div>
          <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            {[{k:"urgency" as const,l:"Oncelik"},{k:"date" as const,l:"Tarih"},{k:"messages" as const,l:"Mesaj"}].map(s => (
              <button key={s.k} onClick={() => setSort(s.k)} className={`px-3 py-1.5 text-[10px] font-medium ${sort===s.k?"bg-blue-600 text-white":"text-gray-500 hover:text-white"}`}>{s.l}</button>
            ))}
          </div>
          <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            {[{k:"all",l:"Hepsi"},{k:"today",l:"Bugun"},{k:"3d",l:"3G"},{k:"7d",l:"7G"}].map(f => (
              <button key={f.k} onClick={() => {setTime(f.k); setPage(1);}} className={`px-3 py-1.5 text-[10px] font-medium ${time===f.k?"bg-blue-600 text-white":"text-gray-500 hover:text-white"}`}>{f.l}</button>
            ))}
          </div>
          <div className="flex bg-white/5 rounded-lg border border-white/10 overflow-hidden">
            {[{k:"open",l:"Acik"},{k:"in_progress",l:"Devam"},{k:"resolved",l:"Cozuldu"},{k:"all",l:"Hepsi"}].map(f => (
              <button key={f.k} onClick={() => {setStatus(f.k); setPage(1);}} className={`px-3 py-1.5 text-[10px] font-medium ${status===f.k?"bg-blue-600 text-white":"text-gray-500 hover:text-white"}`}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* Marka Tablari */}
        <div className="px-4 py-2 border-t border-white/5 flex gap-1.5 overflow-x-auto">
          {[{k:"all",l:"Tumu",n:topics.length}, ...Object.entries(bc).sort((a,b)=>b[1]-a[1]).map(([b,c])=>({k:b,l:b,n:c}))].map(x => (
            <button key={x.k} onClick={() => {setBrand(x.k); setPage(1);}}
              className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all ${
                brand===x.k ? "bg-blue-600 text-white" : "bg-white/5 text-gray-500 hover:text-white hover:bg-white/10"
              }`}>
              {x.l} <span className="opacity-50">{x.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== KONU KARTLARI ===== */}
      <div className="space-y-2">
        {paged.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Bu filtrede konu yok</p>
          </div>
        ) : paged.map(topic => {
          const d = DURUM[topic.durum] || DURUM.BILGI;
          const isExp = exp === topic.id;
          const isSel = sel.has(topic.id);
          const isPin = pinned.has(topic.id);
          const story = parseStory(topic.summary);

          return (
            <div key={topic.id} className={`group rounded-xl border transition-all ${isPin ? "border-amber-500/30 bg-amber-500/[0.03]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"} ${isSel?"ring-1 ring-blue-500":""}`}>
              {/* Kart Header */}
              <div className="p-4 cursor-pointer" onClick={() => selMode ? (isSel ? sel.delete(topic.id) : sel.add(topic.id), setSel(new Set(sel))) : tog(topic.id)}>
                <div className="flex gap-3">
                  {selMode && (
                    <div className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${isSel?"bg-blue-600 border-blue-600":"border-gray-700"}`}>
                      {isSel && <Check className="w-3 h-3" />}
                    </div>
                  )}

                  {/* Urgency */}
                  <div className={`w-10 h-10 rounded-xl ${d.bg} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white text-sm font-black">{topic.urgency}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Ust satir: durum + marka + grup + zaman */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      <span className={`${d.bg} text-white px-1.5 py-0.5 rounded font-bold text-[9px]`}>{d.label}</span>
                      <span className={`font-semibold ${BRAND_COLOR[getBrand(topic.group_title)]||"text-gray-400"}`}>{getBrand(topic.group_title)}</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-500 truncate max-w-[180px]">{topic.group_title}</span>
                      {topic.assigned_to && <><span className="text-gray-600">·</span><span className="text-indigo-400 flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{topic.assigned_to}</span></>}
                      <span className="text-gray-600 ml-auto hidden sm:flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{formatDateIST(topic.last_message_at)}</span>
                      <span className="text-gray-700 flex items-center gap-0.5"><MessageSquare className="w-2.5 h-2.5" />{topic.message_count}</span>
                    </div>

                    {/* Baslik */}
                    <h3 className="font-semibold text-[13px] mt-1.5 leading-snug">{topic.title}</h3>

                    {/* Sorun Ozeti - 1 cumle */}
                    {story.sorun && (
                      <p className="text-xs text-gray-300 mt-1.5 leading-relaxed line-clamp-2">{story.sorun}</p>
                    )}

                    {/* Aksiyon satiri */}
                    {(topic.last_aksiyon || story.aksiyon) && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <ArrowRight className="w-3 h-3 text-orange-400 flex-shrink-0" />
                        <p className="text-[11px] text-orange-400/90 font-medium">{topic.last_aksiyon || story.aksiyon}</p>
                      </div>
                    )}

                    {/* Son durum badge */}
                    {story.sonDurum && (
                      <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        story.sonDurum.includes("COZULDU") || story.sonDurum.includes("Cozuldu") || story.sonDurum.includes("tamamland")
                          ? "bg-green-500/10 text-green-400"
                          : story.sonDurum.includes("BEKL") || story.sonDurum.includes("bekl")
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        <Activity className="w-2.5 h-2.5" />
                        {story.sonDurum}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={e => {e.stopPropagation(); setPinned(p => {const n=new Set(p); n.has(topic.id)?n.delete(topic.id):n.add(topic.id); return n;});}} className={`p-1 rounded ${isPin?"text-amber-400":"text-gray-800 group-hover:text-gray-600"}`}><Pin className="w-3 h-3" /></button>
                    {isExp ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />}
                  </div>
                </div>
              </div>

              {/* ===== DETAY - HIKAYE GORUNUMU ===== */}
              {isExp && !selMode && (
                <div className="border-t border-white/5">

                  {/* === HIKAYE PANELI === */}
                  <div className="bg-[#080812] p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                      {/* SOL: Sorun + Kronoloji */}
                      <div className="md:col-span-2 space-y-4">
                        {/* Sorun Kutusu */}
                        {story.sorun && (
                          <div className={`rounded-xl p-4 border ${d.bgSoft} border-white/5`}>
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle className={`w-4 h-4 ${d.color}`} />
                              <span className={`text-[11px] font-bold uppercase tracking-wider ${d.color}`}>Sorun</span>
                            </div>
                            <p className="text-sm text-white leading-relaxed">{story.sorun}</p>
                          </div>
                        )}

                        {/* Kronoloji */}
                        {story.kronoloji.length > 0 && (
                          <div className="rounded-xl p-4 bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                              <Clock className="w-4 h-4 text-blue-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">Kronoloji</span>
                            </div>
                            <div className="space-y-0">
                              {story.kronoloji.map((item, i) => {
                                // Parse "HH:MM - olay" format
                                const match = item.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(.+)$/);
                                const saat = match ? match[1] : "";
                                const olay = match ? match[2] : item.replace(/^[-–]\s*/, "");

                                return (
                                  <div key={i} className="flex gap-3 group/item">
                                    {/* Timeline nokta ve cizgi */}
                                    <div className="flex flex-col items-center w-3 pt-0.5">
                                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i === story.kronoloji.length - 1 ? d.bg : "bg-white/20"}`} />
                                      {i < story.kronoloji.length - 1 && <div className="w-px flex-1 bg-white/10 min-h-[16px]" />}
                                    </div>
                                    {/* Saat + Olay */}
                                    <div className="flex-1 pb-3">
                                      <div className="flex items-baseline gap-2">
                                        {saat && <span className="text-[10px] font-mono text-gray-500 w-10 flex-shrink-0">{saat}</span>}
                                        <span className={`text-xs leading-relaxed ${i === story.kronoloji.length - 1 ? "text-white font-medium" : "text-gray-400"}`}>{olay}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SAG: Son Durum + Aksiyon */}
                      <div className="space-y-4">
                        {/* Son Durum */}
                        {story.sonDurum && (
                          <div className={`rounded-xl p-4 border ${
                            story.sonDurum.includes("COZULDU") || story.sonDurum.includes("Cozuldu") || story.sonDurum.includes("tamamland")
                              ? "bg-green-500/5 border-green-500/20"
                              : story.sonDurum.includes("BEKL") || story.sonDurum.includes("bekl")
                              ? "bg-amber-500/5 border-amber-500/20"
                              : "bg-red-500/5 border-red-500/20"
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className={`w-4 h-4 ${
                                story.sonDurum.includes("COZULDU") || story.sonDurum.includes("tamamland") ? "text-green-400"
                                : story.sonDurum.includes("BEKL") || story.sonDurum.includes("bekl") ? "text-amber-400"
                                : "text-red-400"
                              }`} />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Son Durum</span>
                            </div>
                            <p className="text-sm text-white leading-relaxed">{story.sonDurum}</p>
                          </div>
                        )}

                        {/* Aksiyon */}
                        {(story.aksiyon || topic.last_aksiyon) && (
                          <div className="rounded-xl p-4 bg-orange-500/5 border border-orange-500/20">
                            <div className="flex items-center gap-2 mb-2">
                              <Target className="w-4 h-4 text-orange-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">Aksiyon</span>
                            </div>
                            <p className="text-sm text-white leading-relaxed">{story.aksiyon || topic.last_aksiyon}</p>
                          </div>
                        )}

                        {/* Atanan kisi */}
                        {topic.assigned_to && (
                          <div className="rounded-xl p-3 bg-indigo-500/5 border border-indigo-500/20">
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-xs text-indigo-400 font-medium">{topic.assigned_to}</span>
                            </div>
                          </div>
                        )}

                        {/* Eski formattaki ozetler icin fallback */}
                        {!story.kronoloji.length && !story.sonDurum && !story.aksiyon && story.sorun && story.sorun === story.raw && (
                          <div className="rounded-xl p-4 bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                              <MessageSquare className="w-4 h-4 text-gray-400" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Ozet</span>
                            </div>
                            <p className="text-xs text-gray-300 leading-relaxed">{story.raw}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* === MESAJLAR (acilir/kapanir) === */}
                  <div className="border-t border-white/5">
                    <button
                      onClick={() => setShowMsgs(p => ({...p, [topic.id]: !p[topic.id]}))}
                      className="w-full px-5 py-2.5 flex items-center gap-2 text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span className="font-medium">Ham Mesajlar ({topic.messages?.length || topic.message_count})</span>
                      {topic.messages && topic.messages.length > 0 && (
                        <Link href={`/chat?group=${topic.group_id}&msg=${topic.messages[0].telegram_msg_id}`}
                          className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-600/10 px-2 py-0.5 rounded-lg ml-2"
                          onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="w-2.5 h-2.5" /> Telegram&apos;da Gor
                        </Link>
                      )}
                      {showMsgs[topic.id] ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                    </button>

                    {showMsgs[topic.id] && (
                      <div className="px-5 pb-4 max-h-[400px] overflow-y-auto">
                        {(topic.messages||[]).map((m, i) => (
                          <div key={m.id} className="flex gap-2.5 mb-2 last:mb-0">
                            <div className="flex flex-col items-center min-w-[10px]">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                              {i < (topic.messages?.length||0)-1 && <div className="w-px flex-1 bg-white/5 mt-1" />}
                            </div>
                            <div className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-white/5 group/msg">
                              <div className="flex items-center gap-2 text-[10px] mb-1">
                                <span className="font-bold text-blue-400">{m.sender_name}</span>
                                <Link href={`/chat?group=${topic.group_id}&msg=${m.telegram_msg_id}`} className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 bg-blue-600/10 px-1.5 py-0.5 rounded" title="Telegram sohbetinde gor">
                                  <ExternalLink className="w-2.5 h-2.5" />Goruntule
                                </Link>
                                <span className="text-gray-700 ml-auto">{formatDateIST(m.date)}</span>
                              </div>
                              <p className="text-xs leading-relaxed text-gray-300">{m.text}</p>
                              {m.matched_keywords?.length > 0 && <div className="flex gap-1 mt-1.5">{m.matched_keywords.map(k => <span key={k} className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">{k}</span>)}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* === ALT PANEL: Aksiyonlar === */}
                  <div className="p-4 border-t border-white/5 bg-black/20 space-y-3">
                    {/* Aksiyonlar */}
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => close_(topic.id)} className="text-[10px] bg-green-500/10 text-green-400 hover:bg-green-500/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Check className="w-3 h-3" />Cozuldu</button>
                      <button onClick={() => supabase.from("topics").update({status:"in_progress"}).eq("id",topic.id).then(() => { fetchData(); toast("Durum guncellendi: Devam Ediyor"); })} className="text-[10px] bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-lg">Devam Ediyor</button>
                    </div>

                    {/* Kisi Atama */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium">Kisiye Ata</span>
                        {topic.assigned_to && <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">{topic.assigned_to}</span>}
                      </div>
                      <input type="text" placeholder="Kisi ara..." value={memberSearch[topic.id]||""} onChange={e => setMemberSearch(p => ({...p,[topic.id]:e.target.value}))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] focus:outline-none focus:border-blue-500/50 mb-1.5 placeholder-gray-700" />
                      <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
                        {(topic.members||[]).filter(m => !memberSearch[topic.id] || m.sender_name.toLowerCase().includes((memberSearch[topic.id]||"").toLowerCase())).slice(0,15).map(m => (
                          <button key={m.sender_id} onClick={() => assignPerson(topic.id, m.sender_name, m.sender_id)}
                            className={`text-[9px] px-2 py-0.5 rounded-full border transition-all ${topic.assigned_to===m.sender_name?"bg-indigo-600 border-indigo-500 text-white":"bg-white/5 border-white/10 text-gray-500 hover:text-white"}`}>
                            {m.sender_name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Not */}
                    <div>
                      <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium flex items-center gap-1 mb-1"><StickyNote className="w-3 h-3" />Not</span>
                      <textarea defaultValue={topic.notes||""} onBlur={e => saveNote(topic.id, e.target.value)} rows={2} placeholder="Not ekle..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-blue-500/50 resize-none placeholder-gray-700" />
                    </div>

                    {/* Cevap */}
                    <div className="flex gap-2">
                      <input type="text" placeholder="Gruba cevap yaz..." value={reply[topic.id]||""} onChange={e => setReply(p => ({...p,[topic.id]:e.target.value}))} onKeyDown={e => e.key==="Enter" && doReply(topic)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/50 placeholder-gray-700" />
                      <button onClick={() => doReply(topic)} disabled={!reply[topic.id]?.trim()} className="bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-gray-700 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5"><Send className="w-3.5 h-3.5" />Gonder</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {tp > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page<=1} className="p-2 bg-white/5 rounded-lg disabled:opacity-20"><ChevronLeft className="w-4 h-4" /></button>
          {Array.from({length:Math.min(tp,7)},(_,i) => { let p; if(tp<=7)p=i+1;else if(page<=4)p=i+1;else if(page>=tp-3)p=tp-6+i;else p=page-3+i; return <button key={p} onClick={()=>setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-medium ${page===p?"bg-blue-600 text-white":"bg-white/5 text-gray-500 hover:text-white"}`}>{p}</button>; })}
          <button onClick={() => setPage(Math.min(tp,page+1))} disabled={page>=tp} className="p-2 bg-white/5 rounded-lg disabled:opacity-20"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
