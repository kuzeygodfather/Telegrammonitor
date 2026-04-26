"use client";

import { useEffect, useState } from "react";
import { Wand2, Send, Check, X, Edit3, Plus, Trash2, RefreshCw, Loader2, MessageSquare, Brain, BookOpen, AlertTriangle, ChevronDown, AtSign, Sparkles } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { sendReply } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface StyleProfile { style_summary: string; tone: string; common_phrases: string[]; rules: string[]; }
interface Sample { id: number; context: string; message: string; category: string; created_at: string; }
interface Suggestion { id: number; group_id: number; group_title: string; sender_name: string; original_message: string; suggested_reply: string; edited_reply: string|null; status: string; telegram_msg_id: number; created_at: string; conversation_context?: { sender: string; text: string; time: string }[]; }

function timeAgo(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}dk`; const h = Math.floor(m/60); if (h < 24) return `${h}sa`; return `${Math.floor(h/24)}g`; }

const TONE_PRESETS = ["resmi", "samimi", "kisa ve net", "detayli", "nazik", "otoriter", "sorgulamaci", "profesyonel", "arkadas gibi", "emir verici", "ricaci"];

function StyleEditor({ profile, setProfile, analyzing, analyzeStyle, uid, toast: showToast }: {
  profile: StyleProfile|null; setProfile: (p: StyleProfile) => void;
  analyzing: boolean; analyzeStyle: () => void; uid: number; toast: (msg: string) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState("");
  const [tone, setTone] = useState("");
  const [phrases, setPhrases] = useState<string[]>([]);
  const [rules, setRules] = useState<string[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [newRule, setNewRule] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) { setSummary(profile.style_summary); setTone(profile.tone); setPhrases([...profile.common_phrases]); setRules([...profile.rules]); }
  }, [profile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch("/api/style/update-profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, style_summary: summary, tone, common_phrases: phrases, rules }),
      });
      setProfile({ style_summary: summary, tone, common_phrases: phrases, rules });
      setEditMode(false);
      showToast("Stil profili kaydedildi");
    } catch { showToast("Hata"); }
    setSaving(false);
  };

  const addPhrase = () => { if (newPhrase.trim()) { setPhrases([...phrases, newPhrase.trim()]); setNewPhrase(""); } };
  const removePhrase = (i: number) => setPhrases(phrases.filter((_, idx) => idx !== i));
  const addRule = () => { if (newRule.trim()) { setRules([...rules, newRule.trim()]); setNewRule(""); } };
  const removeRule = (i: number) => setRules(rules.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> Yazim Stil Profilim</h2>
        <div className="flex gap-2">
          {profile && !editMode && <button onClick={() => setEditMode(true)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2"><Edit3 className="w-3.5 h-3.5" /> Duzenle</button>}
          <button onClick={analyzeStyle} disabled={analyzing} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {profile ? "AI ile Yeniden Analiz" : "Stilimi Analiz Et"}
          </button>
        </div>
      </div>

      {!profile && !editMode ? (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <Brain className="w-16 h-16 text-gray-700 mx-auto mb-4" />
          <p className="text-sm text-gray-400">Stil profiliniz henuz olusturulmadi</p>
          <p className="text-xs text-gray-600 mt-2">AI ile analiz edin veya manuel olusturun</p>
          <button onClick={() => setEditMode(true)} className="mt-4 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-xs font-medium">Manuel Olustur</button>
        </div>
      ) : editMode ? (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-600/30">
            <label className="text-[11px] text-gray-400 font-medium block mb-2">Genel Stil Tanimi</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder="Mesajlarinizi nasil yazdiginizi tanimlayiniz..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-600/30">
            <label className="text-[11px] text-gray-400 font-medium block mb-2">Ton / Uslup</label>
            <input value={tone} onChange={e => setTone(e.target.value)} placeholder="Orn: resmi, samimi, kisa ve net..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {TONE_PRESETS.map(t => (
                <button key={t} onClick={() => setTone(prev => prev ? `${prev}, ${t}` : t)} className={`px-2.5 py-1 rounded-lg text-[10px] transition-colors ${tone.includes(t) ? "bg-purple-600/30 text-purple-300 border border-purple-600/30" : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-600/30">
            <label className="text-[11px] text-gray-400 font-medium block mb-2">Sik Kullandigim Ifadeler</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {phrases.map((p, i) => (
                <span key={i} className="text-xs bg-blue-600/20 text-blue-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">{p} <button onClick={() => removePhrase(i)} className="text-blue-400/50 hover:text-red-400"><X className="w-3 h-3" /></button></span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newPhrase} onChange={e => setNewPhrase(e.target.value)} onKeyDown={e => e.key === "Enter" && addPhrase()} placeholder="Yeni ifade..." className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
              <button onClick={addPhrase} disabled={!newPhrase.trim()} className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-blue-600/30">
            <label className="text-[11px] text-gray-400 font-medium block mb-2">Stil Kurallari</label>
            <p className="text-[10px] text-gray-600 mb-2">AI bu kurallara uyarak cevap uretir</p>
            <div className="space-y-1.5 mb-3">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-300 bg-gray-900/50 rounded-lg px-3 py-2 group">
                  <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                  <span className="flex-1">{r}</span>
                  <button onClick={() => removeRule(i)} className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newRule} onChange={e => setNewRule(e.target.value)} onKeyDown={e => e.key === "Enter" && addRule()} placeholder="Orn: Kisa mesajlar yaz, emoji kullanma, her zaman hitap et..." className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
              <button onClick={addRule} disabled={!newRule.trim()} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveProfile} disabled={saving} className="bg-green-600 hover:bg-green-500 px-6 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Kaydet
            </button>
            <button onClick={() => { setEditMode(false); if (profile) { setSummary(profile.style_summary); setTone(profile.tone); setPhrases([...profile.common_phrases]); setRules([...profile.rules]); } }} className="bg-gray-700 hover:bg-gray-600 px-6 py-2.5 rounded-xl text-sm">Iptal</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">Genel Stil</h3>
            <p className="text-sm text-gray-200">{profile!.style_summary}</p>
            <div className="mt-3 flex items-center gap-2"><span className="text-[10px] text-gray-500">Ton:</span><span className="text-xs bg-purple-600/20 text-purple-300 px-2 py-0.5 rounded-full">{profile!.tone}</span></div>
          </div>
          {profile!.common_phrases.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Sik Kullanilan Ifadeler</h3>
              <div className="flex flex-wrap gap-2">{profile!.common_phrases.map((p,i) => <span key={i} className="text-xs bg-blue-600/20 text-blue-300 px-2.5 py-1 rounded-lg">{p}</span>)}</div>
            </div>
          )}
          {profile!.rules.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-xs font-semibold text-gray-400 mb-2">Stil Kurallari</h3>
              <ul className="space-y-1">{profile!.rules.map((r,i) => <li key={i} className="text-xs text-gray-300 flex items-center gap-2"><Check className="w-3 h-3 text-green-400" /> {r}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SmartReplyPage() {
  const [tab, setTab] = useState<"suggestions"|"style"|"samples">("suggestions");
  const [profile, setProfile] = useState<StyleProfile|null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [sugFilter, setSugFilter] = useState("pending");
  const [editingId, setEditingId] = useState<number|null>(null);
  const [editText, setEditText] = useState("");
  const [processing, setProcessing] = useState<number|null>(null);
  const [newContext, setNewContext] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [showAddSample, setShowAddSample] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genSender, setGenSender] = useState("");
  const [genMessage, setGenMessage] = useState("");
  const [genGroup, setGenGroup] = useState("");
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();
  const uid = getUserId();

  const loadAll = async () => {
    if (!uid) return;
    try {
      const [pRes, sRes, sgRes] = await Promise.all([
        fetch(`/api/style/profile?user_id=${uid}`).then(r=>r.json()),
        fetch(`/api/style/samples?user_id=${uid}`).then(r=>r.json()),
        fetch(`/api/style/suggestions?user_id=${uid}&status=${sugFilter}`).then(r=>r.json()),
      ]);
      if (pRes.style_summary) setProfile(pRes);
      setSamples(sRes.samples || []);
      setSuggestions(sgRes.suggestions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [sugFilter]);

  const analyzeStyle = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/style/analyze?user_id=${uid}`, { method: "POST" });
      const data = await res.json();
      if (data.success) { setProfile(data.profile); toast(`Stil analiz edildi (${data.sample_count} ornek)`); }
      else toast(data.error || "Analiz basarisiz");
    } catch { toast("Hata olustu"); }
    setAnalyzing(false);
  };

  const addSample = async () => {
    if (!newMessage.trim()) return;
    try {
      await fetch("/api/style/add-sample", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, context: newContext, message: newMessage, category: newCategory }) });
      setNewContext(""); setNewMessage(""); setShowAddSample(false);
      toast("Ornek eklendi"); loadAll();
    } catch {}
  };

  const deleteSample = async (id: number) => {
    await fetch(`/api/style/sample/${id}`, { method: "DELETE" });
    setSamples(p => p.filter(s => s.id !== id));
  };

  const handleSuggestionAction = async (id: number, action: string, edited?: string) => {
    setProcessing(id);
    try {
      const res = await fetch("/api/style/suggestion-action", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, user_id: uid, action, edited_reply: edited || "" }) });
      const data = await res.json();
      if (data.success) { toast(action === "approve" || action === "edit" ? "Mesaj gonderildi!" : "Reddedildi"); setSuggestions(p => p.map(s => s.id === id ? { ...s, status: action === "reject" ? "rejected" : "approved" } : s)); setEditingId(null); }
      else toast(data.error || "Hata");
    } catch { toast("Hata"); }
    setProcessing(null);
  };

  const generateReply = async () => {
    if (!genMessage.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/style/generate-reply", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, sender_name: genSender, original_message: genMessage, group_title: genGroup }) });
      const data = await res.json();
      if (data.suggestion) { toast("Oneri olusturuldu!"); setShowGenerate(false); setGenSender(""); setGenMessage(""); setGenGroup(""); setSugFilter("pending"); loadAll(); }
      else toast(data.error || "Olusturulamadi");
    } catch { toast("Hata"); }
    setGenerating(false);
  };

  const pendingCount = suggestions.filter(s => s.status === "pending").length;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600/20 rounded-xl flex items-center justify-center"><Sparkles className="w-5 h-5 text-purple-400" /></div>
          <div><h1 className="text-2xl font-bold">Akilli Mesaj Asistani</h1><p className="text-xs text-gray-500">Stilinizi ogrenir, mesaj onerisi olusturur</p></div>
        </div>
        <button onClick={() => setShowGenerate(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium"><Wand2 className="w-4 h-4" /> Cevap Onerisi Olustur</button>
      </div>

      <div className="flex gap-2">
        {([
          { k: "suggestions" as const, l: "Oneriler", badge: pendingCount },
          { k: "style" as const, l: "Stil Profilim", badge: 0 },
          { k: "samples" as const, l: "Ornek Mesajlar", badge: samples.length },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${tab === t.k ? "bg-blue-600 text-white" : "bg-white/5 text-gray-400 hover:text-white border border-white/10"}`}>
            {t.l} {t.badge > 0 && <span className="bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {showGenerate && (
        <div className="bg-gray-800 rounded-xl p-5 border border-purple-600/30">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Wand2 className="w-4 h-4 text-purple-400" /> Manuel Cevap Onerisi</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[10px] text-gray-500 mb-1 block">Gonderen</label><input value={genSender} onChange={e=>setGenSender(e.target.value)} placeholder="Kisi adi..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500" /></div>
              <div><label className="text-[10px] text-gray-500 mb-1 block">Grup</label><input value={genGroup} onChange={e=>setGenGroup(e.target.value)} placeholder="Grup adi..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500" /></div>
            </div>
            <div><label className="text-[10px] text-gray-500 mb-1 block">Gelen Mesaj</label><textarea value={genMessage} onChange={e=>setGenMessage(e.target.value)} rows={3} placeholder="Cevaplanacak mesaji yazin..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500 resize-none" /></div>
            <div className="flex gap-2">
              <button onClick={generateReply} disabled={generating || !genMessage.trim()} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2">{generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Olustur</button>
              <button onClick={() => setShowGenerate(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-xs">Iptal</button>
            </div>
          </div>
        </div>
      )}

      {tab === "suggestions" && (
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {["pending","approved","rejected","all"].map(f => (
              <button key={f} onClick={() => setSugFilter(f)} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium ${sugFilter === f ? "bg-blue-600 text-white" : "bg-gray-700/50 text-gray-400"}`}>
                {f === "pending" ? "Bekleyen" : f === "approved" ? "Onaylanan" : f === "rejected" ? "Reddedilen" : "Tumu"}
              </button>
            ))}
          </div>
          {suggestions.length === 0 ? (
            <div className="text-center py-16 text-gray-500"><Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-700" /><p className="text-sm">Henuz oneri yok</p><p className="text-xs text-gray-600 mt-1">Yukardaki Cevap Onerisi Olustur ile baslayabilirsiniz</p></div>
          ) : suggestions.map(s => (
            <div key={s.id} className={`bg-gray-800 rounded-xl p-4 border ${s.status === "pending" ? "border-purple-600/30" : s.status === "approved" ? "border-green-600/20" : "border-gray-700"}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded">{s.group_title || "Grup"}</span>
                <span className="text-xs font-medium text-gray-300">{s.sender_name}</span>
                <span className="text-[10px] text-gray-600 ml-auto">{timeAgo(s.created_at)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === "pending" ? "bg-purple-600/20 text-purple-300" : s.status === "approved" ? "bg-green-600/20 text-green-300" : "bg-red-600/20 text-red-300"}`}>
                  {s.status === "pending" ? "Bekliyor" : s.status === "approved" ? "Gonderildi" : "Reddedildi"}
                </span>
              </div>
              {/* Conversation Timeline */}
              <div className="bg-gray-900/50 rounded-lg mb-3 overflow-hidden">
                {s.conversation_context && s.conversation_context.length > 0 ? (
                  <div className="max-h-[250px] overflow-y-auto">
                    <div className="px-3 pt-2 pb-1 border-b border-gray-700/50 flex items-center gap-2">
                      <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider">Konusma Gecmisi</span>
                      <span className="text-[9px] text-gray-600">{s.conversation_context.length} mesaj</span>
                    </div>
                    <div className="px-3 py-2">
                      {s.conversation_context.map((c: {sender:string;text:string;time:string}, ci: number) => {
                        const isTrigger = ci === s.conversation_context!.length - 1;
                        const isSender = c.sender === s.sender_name;
                        const timeStr = c.time ? new Date(c.time).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit"}) : "";
                        return (
                          <div key={ci} className="flex gap-2 mb-1.5 last:mb-0">
                            <div className="flex flex-col items-center min-w-[8px]">
                              <div className={`w-2 h-2 rounded-full mt-1.5 ${isTrigger ? "bg-orange-500" : isSender ? "bg-blue-500" : "bg-gray-600"}`} />
                              {ci < s.conversation_context!.length - 1 && <div className="w-px flex-1 bg-gray-700/50 mt-0.5" />}
                            </div>
                            <div className={`flex-1 rounded-lg p-2 ${isTrigger ? "bg-orange-500/10 border border-orange-500/20" : "bg-white/[0.02]"}`}>
                              <div className="flex items-center gap-2 text-[10px] mb-0.5">
                                <span className={`font-bold ${isTrigger ? "text-orange-400" : isSender ? "text-blue-400" : "text-gray-400"}`}>{c.sender}</span>
                                {timeStr && <span className="text-gray-700 ml-auto">{timeStr}</span>}
                              </div>
                              <p className={`text-[11px] leading-relaxed ${isTrigger ? "text-orange-200" : "text-gray-400"}`}>{c.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Etiketleyen mesaj */}
                    <div className="px-3 py-2 border-t border-orange-500/20 bg-orange-500/5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[9px] text-orange-400 font-semibold uppercase">Etiketleyen Mesaj</span>
                      </div>
                      <p className="text-xs text-orange-200 font-medium">{s.original_message}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 border-l-2 border-orange-500/30">
                    <p className="text-[9px] text-gray-600 mb-1">Gelen mesaj:</p>
                    <p className="text-xs text-gray-300">{s.original_message}</p>
                  </div>
                )}
              </div>
              {editingId === s.id ? (
                <div className="space-y-2">
                  <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} className="w-full bg-gray-900 border border-purple-600/30 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => handleSuggestionAction(s.id, "edit", editText)} disabled={processing === s.id} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1"><Send className="w-3 h-3" /> Duzenleyip Gonder</button>
                    <button onClick={() => setEditingId(null)} className="bg-gray-700 px-3 py-1.5 rounded-lg text-xs">Iptal</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-purple-600/5 border border-purple-600/15 rounded-lg p-3 mb-3">
                    <p className="text-xs text-gray-200 flex items-start gap-2"><Sparkles className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" /> {s.edited_reply || s.suggested_reply}</p>
                  </div>
                  {s.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleSuggestionAction(s.id, "approve")} disabled={processing === s.id} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1.5">{processing === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Onayla ve Gonder</button>
                      <button onClick={() => { setEditingId(s.id); setEditText(s.suggested_reply); }} className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><Edit3 className="w-3 h-3" /> Duzenle</button>
                      <button onClick={() => handleSuggestionAction(s.id, "reject")} disabled={processing === s.id} className="bg-red-600/20 hover:bg-red-600/30 text-red-300 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"><X className="w-3 h-3" /> Reddet</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "style" && (
        <StyleEditor profile={profile} setProfile={setProfile} analyzing={analyzing} analyzeStyle={analyzeStyle} uid={uid} toast={toast} />
      )}

      {tab === "samples" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-400" /> Ornek Mesajlar ({samples.length})</h2>
            <button onClick={() => setShowAddSample(true)} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Ornek Ekle</button>
          </div>
          <p className="text-xs text-gray-500">Tipik mesajlarinizi ekleyin - AI stilinizi bunlardan ogrenir. Onaylanan cevaplar otomatik eklenir.</p>
          {showAddSample && (
            <div className="bg-gray-800 rounded-xl p-4 border border-green-600/30 space-y-3">
              <div><label className="text-[10px] text-gray-500 mb-1 block">Baglam (opsiyonel)</label><input value={newContext} onChange={e=>setNewContext(e.target.value)} placeholder="Orn: Musteri sikayet ettiginde..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-green-500" /></div>
              <div><label className="text-[10px] text-gray-500 mb-1 block">Mesajiniz</label><textarea value={newMessage} onChange={e=>setNewMessage(e.target.value)} rows={2} placeholder="Kendi yazdiginiz bir mesaj ornegi..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-green-500 resize-none" /></div>
              <div className="flex items-center gap-3">
                <select value={newCategory} onChange={e=>setNewCategory(e.target.value)} className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-100">
                  <option value="general">Genel</option><option value="greeting">Selamlama</option><option value="complaint">Sikayete Cevap</option><option value="request">Talep Yaniti</option><option value="info">Bilgi Verme</option><option value="urgent">Acil Durum</option>
                </select>
                <button onClick={addSample} disabled={!newMessage.trim()} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50">Ekle</button>
                <button onClick={() => setShowAddSample(false)} className="text-gray-500 text-xs">Iptal</button>
              </div>
            </div>
          )}
          {samples.length === 0 ? (
            <div className="text-center py-12 text-gray-500"><BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-700" /><p className="text-sm">Henuz ornek mesaj yok</p></div>
          ) : samples.map(s => (
            <div key={s.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><span className="text-[10px] bg-gray-700 px-2 py-0.5 rounded">{s.category}</span><span className="text-[10px] text-gray-600">{timeAgo(s.created_at)}</span></div>
                <button onClick={() => deleteSample(s.id)} className="text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              {s.context && <p className="text-[10px] text-gray-500 mb-1 italic">Baglam: {s.context}</p>}
              <p className="text-xs text-gray-300">{s.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
