"use client";

import { useEffect, useState } from "react";
import { Users, Eye, EyeOff, MessageSquare, Search, ChevronDown, ChevronUp, Save, AlertTriangle, CheckCircle, Star, RefreshCw } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { useToast } from "@/components/Toast";

interface Group {
  id: number; title: string; is_monitored: boolean; member_count: number|null;
  message_count: number; last_activity: string|null;
  description: string|null; important_topics: string|null; ignore_topics: string|null; my_interests: string|null;
}

function getBrand(t: string): string {
  const l = t.toLowerCase().replace(/İ/g, "i");
  if (/bia|biabet|livebia/.test(l)) return "BIA";
  if (/benja|benjabet|livebenja|bnj/.test(l)) return "Benjabet";
  if (/dil|dilbet|dilrulet/.test(l)) return "Dilbet";
  if (/dopamin/.test(l)) return "Dopamin";
  return "Diger";
}
const BRANDS = ["BIA", "Benjabet", "Dilbet", "Dopamin", "Diger"];
const BC: Record<string, string> = { BIA: "text-purple-400", Benjabet: "text-emerald-400", Dilbet: "text-cyan-400", Dopamin: "text-pink-400", Diger: "text-gray-400" };

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [toggling, setToggling] = useState<number|null>(null);
  const [expanded, setExpanded] = useState<number|null>(null);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState<Record<number, { desc: string; important: string; interests: string; ignore: string }>>({});

  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchGroups = () => {
    return Promise.all([
      supabase.from("groups").select("id,title,is_monitored,member_count,description,important_topics,ignore_topics,my_interests").eq("user_id", getUserId()).order("title"),
      supabase.rpc("get_group_stats")
    ]).then(([{ data: gData }, { data: stats }]) => {
      const sm: Record<number, { message_count: number; last_activity: string|null }> = {};
      (stats||[]).forEach((s: Record<string, unknown>) => { sm[s.id as number] = { message_count: s.message_count as number, last_activity: s.last_activity as string|null }; });
      setGroups((gData||[]).map((g: Record<string, unknown>) => ({ ...g, message_count: sm[g.id as number]?.message_count||0, last_activity: sm[g.id as number]?.last_activity||null })) as Group[]);
      setLoading(false);
    });
  };

  const refresh = async () => { setRefreshing(true); await fetchGroups(); toast("Gruplar guncellendi"); setRefreshing(false); };

  useEffect(() => { fetchGroups(); }, []);

  const toggle = async (id: number, cur: boolean) => {
    setToggling(id);
    await supabase.from("groups").update({ is_monitored: !cur }).eq("id", id);
    setGroups(p => p.map(g => g.id === id ? { ...g, is_monitored: !cur } : g));
    setToggling(null);
  };

  const expand = (id: number) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    const g = groups.find(x => x.id === id);
    if (g && !form[id]) {
      setForm(p => ({ ...p, [id]: { desc: g.description||"", important: g.important_topics||"", interests: g.my_interests||"", ignore: g.ignore_topics||"" } }));
    }
  };

  const save = async (id: number) => {
    const f = form[id]; if (!f) return;
    setSaving(p => ({ ...p, [id]: true }));
    await supabase.from("groups").update({ description: f.desc||null, important_topics: f.important||null, my_interests: f.interests||null, ignore_topics: f.ignore||null }).eq("id", id);
    setGroups(p => p.map(g => g.id === id ? { ...g, description: f.desc||null, important_topics: f.important||null, my_interests: f.interests||null, ignore_topics: f.ignore||null } : g));
    setSaving(p => ({ ...p, [id]: false }));
    setSaved(p => ({ ...p, [id]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [id]: false })), 2000);
  };

  const upd = (id: number, key: string, val: string) => {
    setForm(p => ({ ...p, [id]: { ...p[id], [key]: val } }));
  };

  const filtered = groups.filter(g => {
    if (!g.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (brand !== "all" && getBrand(g.title) !== brand) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-green-400" />Gruplar</h1>
          <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-50"><RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} /></button>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{filtered.filter(g=>g.is_monitored).length}/{filtered.length} izleniyor · {filtered.filter(g=>g.description||g.important_topics||g.my_interests).length} tanimlanmis</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto">
        <button onClick={() => setBrand("all")} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${brand==="all"?"bg-blue-600 text-white":"bg-white/5 text-gray-500 hover:text-white"}`}>Tumu ({groups.length})</button>
        {BRANDS.map(b => { const c=groups.filter(g=>getBrand(g.title)===b).length; return <button key={b} onClick={()=>setBrand(b)} className={`px-3 py-1.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${brand===b?"bg-blue-600 text-white":"bg-white/5 text-gray-500 hover:text-white"}`}>{b} ({c})</button>; })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-600" />
        <input type="text" placeholder="Grup ara..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
      </div>

      <div className="space-y-1">
        {filtered.map(g => {
          const isExp = expanded === g.id;
          const hasConfig = !!(g.description || g.important_topics || g.my_interests);
          const f = form[g.id] || { desc: "", important: "", interests: "", ignore: "" };

          return (
            <div key={g.id} className={`rounded-xl border transition-all ${g.is_monitored ? "border-white/5 bg-white/[0.02]" : "border-white/5 bg-white/[0.01] opacity-40"}`}>
              <div className="p-3 flex items-center gap-3">
                <button onClick={() => toggle(g.id, g.is_monitored)} disabled={toggling===g.id}
                  className={`p-1.5 rounded-lg flex-shrink-0 ${toggling===g.id?"animate-pulse bg-gray-800":g.is_monitored?"bg-green-500/10 text-green-400 hover:bg-green-500/20":"bg-white/5 text-gray-600 hover:bg-white/10"}`}>
                  {g.is_monitored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => expand(g.id)}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold ${BC[getBrand(g.title)]}`}>{getBrand(g.title)}</span>
                    <h3 className="text-sm font-medium truncate">{g.title}</h3>
                    {hasConfig && <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-600 mt-0.5">
                    <span><MessageSquare className="w-2.5 h-2.5 inline" /> {g.message_count}</span>
                    {g.description && <span className="text-gray-500 truncate max-w-[250px]">· {g.description}</span>}
                  </div>
                </div>
                <button onClick={() => expand(g.id)} className="p-1 text-gray-700 hover:text-gray-400">
                  {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {isExp && (
                <div className="border-t border-white/5 bg-black/20 p-4 space-y-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">AI Tanimlama</p>

                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 block">Bu grupta ne konusulur?</label>
                    <textarea value={f.desc} onChange={e => upd(g.id, "desc", e.target.value)} placeholder="Ornek: Musteri cekim iptalleri. Personel onay/red islemleri yapar." rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs resize-none placeholder-gray-700 focus:outline-none focus:border-blue-500/50" />
                  </div>

                  <div>
                    <label className="text-[11px] text-red-400 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />ONEMLI konular (uyari olustur)</label>
                    <textarea value={f.important} onChange={e => upd(g.id, "important", e.target.value)} placeholder="Ornek: 10K ustu cekimler, 30dk gecen beklemeler, fraud supheleri" rows={2}
                      className="w-full bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2 text-xs resize-none placeholder-gray-700 focus:outline-none focus:border-red-500/50" />
                  </div>

                  <div>
                    <label className="text-[11px] text-amber-400 mb-1 flex items-center gap-1"><Star className="w-3 h-3" />Beni ilgilendiren konular (takip etmem gerekenler)</label>
                    <textarea value={f.interests} onChange={e => upd(g.id, "interests", e.target.value)} placeholder="Ornek: Yonetici onay bekleyen islemler, personel sikayetleri, fraud vakalari, tutar uyusmazliklari" rows={2}
                      className="w-full bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 text-xs resize-none placeholder-gray-700 focus:outline-none focus:border-amber-500/50" />
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">ONEMSIZ konular (filtrele)</label>
                    <textarea value={f.ignore} onChange={e => upd(g.id, "ignore", e.target.value)} placeholder="Ornek: Rutin onay mesajlari, bot bildirimleri, shift degisimi" rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs resize-none placeholder-gray-700 focus:outline-none focus:border-blue-500/50" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => save(g.id)} disabled={saving[g.id]}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium ${saving[g.id]?"bg-gray-700 text-gray-400":"bg-blue-600 hover:bg-blue-500 text-white"}`}>
                      <Save className="w-3.5 h-3.5" />{saving[g.id]?"Kaydediliyor...":"Kaydet"}
                    </button>
                    {saved[g.id] && <span className="text-xs text-green-400">Kaydedildi!</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
