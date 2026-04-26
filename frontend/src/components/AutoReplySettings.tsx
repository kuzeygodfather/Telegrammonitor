"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Clock, Loader2, Check, Edit3, Timer, Briefcase, AtSign, ChevronDown, ChevronRight, Reply, ExternalLink, AlertTriangle, CheckCircle, XCircle, RefreshCw, Eye } from "lucide-react";

interface Settings {
  enabled: boolean;
  message: string;
  timeout_minutes: number;
  only_mentions: boolean;
  only_work_hours: boolean;
  work_start: string;
  work_end: string;
}

interface PendingMention {
  id: number;
  user_id: number;
  group_id: number;
  message_id: number;
  sender_name: string;
  message_text: string;
  mentioned_at: string;
  replied: boolean;
  auto_replied: boolean;
}

const PRESET_MESSAGES = [
  "Su an musait degilim, en kisa surede donecegim.",
  "Mesajiniz alindi, en gec 30 dakika icinde donecegim.",
  "Toplantidayim, biter bitmez donecegim.",
  "Mesai saatleri disindayim, yarin sabah ilk is donecegim.",
  "Tesekkurler, konuyu inceliyorum. Kisa surede donecegim.",
];

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "az once";
  if (m < 60) return `${m} dk once`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa once`;
  const d = Math.floor(h / 24);
  return `${d} gun once`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AutoReplySettings({ onSaved }: { onSaved?: () => void } = {}) {
  const [settings, setSettings] = useState<Settings>({
    enabled: false, message: PRESET_MESSAGES[0], timeout_minutes: 20,
    only_mentions: true, only_work_hours: false, work_start: "09:00", work_end: "18:00",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [mentions, setMentions] = useState<PendingMention[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "pending" | "replied" | "auto">("all");

  const getUserId = () => {
    try { return JSON.parse(localStorage.getItem("tg_user") || "{}").id || 0; } catch { return 0; }
  };

  const loadData = async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); return; }
    try {
      const [sRes, mRes] = await Promise.all([
        fetch(`/api/auto-reply/settings?user_id=${uid}`).then(r => r.json()),
        fetch(`/api/auto-reply/pending?user_id=${uid}`).then(r => r.json()),
      ]);
      if (!sRes.error) setSettings(sRes);
      setMentions(mRes.mentions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const updateLocal = (updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await fetch("/api/auto-reply/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: getUserId(), ...settings }),
      });
      setHasChanges(false);
      if (onSaved) onSaved();
    } catch {}
    setSaving(false);
  };

  // Keep backward compat - save is now updateLocal
  const save = updateLocal;

  const markReplied = async (id: number) => {
    try {
      const uid = getUserId();
      const res = await fetch(`/api/auto-reply/mark-replied`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, user_id: uid }),
      });
      setMentions(prev => prev.map(m => m.id === id ? { ...m, replied: true } : m));
    } catch {}
  };

  // Counts
  const pendingCount = mentions.filter(m => !m.replied && !m.auto_replied).length;
  const autoRepliedCount = mentions.filter(m => m.auto_replied).length;
  const repliedCount = mentions.filter(m => m.replied && !m.auto_replied).length;

  // Filtered
  const filteredMentions = mentions.filter(m => {
    if (historyFilter === "pending") return !m.replied && !m.auto_replied;
    if (historyFilter === "replied") return m.replied && !m.auto_replied;
    if (historyFilter === "auto") return m.auto_replied;
    return true;
  });

  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${settings.enabled ? "bg-green-600/20" : "bg-gray-700/30"}`}>
            <MessageSquare className={`w-5 h-5 ${settings.enabled ? "text-green-400" : "text-gray-500"}`} />
          </div>
          <div>
            <p className="text-sm font-medium">{settings.enabled ? "Otomatik Yanit Aktif" : "Otomatik Yanit Kapali"}</p>
            <p className="text-[10px] text-gray-500">
              {settings.enabled ? `${settings.timeout_minutes} dk cevap vermezseniz otomatik mesaj gonderilir` : "Etiketleme yanit sistemi kapali"}
            </p>
          </div>
        </div>
        <button onClick={() => save({ enabled: !settings.enabled })} disabled={saving}
          className={`relative w-12 h-6 rounded-full transition-colors ${settings.enabled ? "bg-green-600" : "bg-gray-700"}`}>
          <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ left: settings.enabled ? "26px" : "2px" }} />
        </button>
      </div>

      {settings.enabled && (<>
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-orange-600/10 border border-orange-600/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-orange-400">{pendingCount}</p>
            <p className="text-[9px] text-gray-500">Bekleyen</p>
          </div>
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-blue-400">{autoRepliedCount}</p>
            <p className="text-[9px] text-gray-500">Oto Yanit</p>
          </div>
          <div className="bg-green-600/10 border border-green-600/20 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-green-400">{repliedCount}</p>
            <p className="text-[9px] text-gray-500">Cevaplanmis</p>
          </div>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-gray-400 font-medium">Yanit Mesaji</label>
            <button onClick={() => setShowPresets(!showPresets)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
              <Edit3 className="w-3 h-3" /> Hazir Mesajlar
            </button>
          </div>
          <textarea value={settings.message} onChange={(e) => setSettings({ ...settings, message: e.target.value })}
            onBlur={() => save({ message: settings.message })}
            rows={2} className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none" />
          {showPresets && (
            <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-2 space-y-1">
              {PRESET_MESSAGES.map((msg, i) => (
                <button key={i} onClick={() => { save({ message: msg }); setShowPresets(false); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${settings.message === msg ? "bg-blue-600/20 text-blue-300" : "text-gray-400 hover:bg-gray-700/50"}`}>
                  {msg}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeout */}
        <div className="space-y-2">
          <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Bekleme Suresi</label>
          <div className="flex items-center gap-2 flex-wrap">
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <button key={m} onClick={() => save({ timeout_minutes: m })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${settings.timeout_minutes === m ? "bg-blue-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>
                {m} dk
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <label className="flex items-center justify-between cursor-pointer bg-gray-900/30 rounded-xl p-3 border border-gray-700/30">
            <div className="flex items-center gap-2.5">
              <AtSign className="w-4 h-4 text-blue-400" />
              <div><p className="text-xs font-medium text-gray-300">Sadece Etiketlemelere</p><p className="text-[10px] text-gray-600">Sadece mention/reply mesajlara yanit</p></div>
            </div>
            <div className="relative"><input type="checkbox" checked={settings.only_mentions} onChange={(e) => save({ only_mentions: e.target.checked })} className="sr-only peer" /><div className="w-9 h-5 rounded-full bg-gray-700 peer-checked:bg-blue-600 transition-colors" /><div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" /></div>
          </label>
          <label className="flex items-center justify-between cursor-pointer bg-gray-900/30 rounded-xl p-3 border border-gray-700/30">
            <div className="flex items-center gap-2.5">
              <Briefcase className="w-4 h-4 text-orange-400" />
              <div><p className="text-xs font-medium text-gray-300">Sadece Mesai Disinda</p><p className="text-[10px] text-gray-600">Mesai saatlerinde yanit gondermez</p></div>
            </div>
            <div className="relative"><input type="checkbox" checked={settings.only_work_hours} onChange={(e) => save({ only_work_hours: e.target.checked })} className="sr-only peer" /><div className="w-9 h-5 rounded-full bg-gray-700 peer-checked:bg-blue-600 transition-colors" /><div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" /></div>
          </label>
          {settings.only_work_hours && (
            <div className="flex items-center gap-3 ml-10">
              <span className="text-[10px] text-gray-500">Mesai:</span>
              <input type="time" value={settings.work_start} onChange={(e) => save({ work_start: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
              <span className="text-[10px] text-gray-500">-</span>
              <input type="time" value={settings.work_end} onChange={(e) => save({ work_end: e.target.value })} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
            </div>
          )}
        </div>

        {/* Save Button */}
        <button onClick={saveAll} disabled={saving || !hasChanges}
          className={`w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all ${hasChanges ? "bg-green-600 hover:bg-green-500 text-white" : "bg-gray-700/50 text-gray-500"}`}>
          {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Kaydediliyor...</> : hasChanges ? <><Check className="w-3.5 h-3.5" /> Kaydet</> : <><Check className="w-3.5 h-3.5" /> Kaydedildi</>}
        </button>

        {/* ===== HISTORY / MENTIONS LOG ===== */}
        <div className="border-t border-gray-700/50 pt-4">
          <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadData(); }}
            className="w-full flex items-center justify-between text-sm font-medium hover:text-blue-400 transition-colors">
            <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Etiketleme Gecmisi</span>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && <span className="bg-orange-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            </div>
          </button>

          {showHistory && (
            <div className="mt-3 space-y-3">
              {/* Filters */}
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { k: "all" as const, l: "Tumu", c: mentions.length },
                  { k: "pending" as const, l: "Bekleyen", c: pendingCount },
                  { k: "auto" as const, l: "Oto Yanit", c: autoRepliedCount },
                  { k: "replied" as const, l: "Cevaplanmis", c: repliedCount },
                ]).map(f => (
                  <button key={f.k} onClick={() => setHistoryFilter(f.k)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${historyFilter === f.k ? "bg-blue-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"}`}>
                    {f.l} ({f.c})
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredMentions.length === 0 ? (
                  <p className="text-xs text-gray-600 text-center py-6">Henuz etiketleme yok</p>
                ) : filteredMentions.map((m) => (
                  <div key={m.id} className={`rounded-xl p-3 border transition-colors ${
                    m.auto_replied ? "bg-blue-600/5 border-blue-600/20" :
                    m.replied ? "bg-green-600/5 border-green-600/20" :
                    "bg-orange-600/5 border-orange-600/20"
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {/* Status badge */}
                        {m.auto_replied ? (
                          <span className="flex items-center gap-1 text-[10px] bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded-full"><Reply className="w-3 h-3" /> Oto Yanit</span>
                        ) : m.replied ? (
                          <span className="flex items-center gap-1 text-[10px] bg-green-600/20 text-green-300 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Cevaplanmis</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] bg-orange-600/20 text-orange-300 px-2 py-0.5 rounded-full"><AlertTriangle className="w-3 h-3" /> Bekliyor</span>
                        )}
                        <span className="text-[10px] text-gray-500">{timeAgo(m.mentioned_at)}</span>
                      </div>
                      <span className="text-[10px] text-gray-600">{formatDate(m.mentioned_at)}</span>
                    </div>

                    {/* Sender */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <AtSign className="w-3 h-3 text-gray-500" />
                      <span className="text-xs font-medium text-gray-300">{m.sender_name || "Bilinmeyen"}</span>
                    </div>

                    {/* Message preview */}
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">{m.message_text || "(mesaj icerigi yok)"}</p>

                    {/* Actions for pending */}
                    {!m.replied && !m.auto_replied && (
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => markReplied(m.id)}
                          className="flex items-center gap-1 text-[10px] bg-green-600/20 text-green-300 hover:bg-green-600/30 px-2.5 py-1 rounded-lg transition-colors">
                          <Check className="w-3 h-3" /> Cevapladim
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Refresh */}
              <button onClick={loadData} className="w-full flex items-center justify-center gap-1.5 text-[10px] text-gray-500 hover:text-blue-400 py-1.5 transition-colors">
                <RefreshCw className="w-3 h-3" /> Yenile
              </button>
            </div>
          )}
        </div>

        {saved && <div className="flex items-center gap-1.5 text-xs text-green-400"><Check className="w-3.5 h-3.5" /> Kaydedildi</div>}
      </>)}
    </div>
  );
}
