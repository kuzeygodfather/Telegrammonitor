"use client";

import { useState, useEffect } from "react";
import { Key, ExternalLink, CreditCard, CheckCircle, XCircle, Loader2, Shield, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";

// ─── Provider tanımları ───────────────────────────────────────────
const PROVIDERS = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    badge: "Tavsiye",
    badgeColor: "bg-purple-600/20 text-purple-300 border-purple-600/30",
    color: "purple",
    placeholder: "sk-ant-api03-...",
    prefix: "sk-ant-",
    models: [
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku — Hızlı & Ucuz" },
      { id: "claude-sonnet-4-20250514",  name: "Claude Sonnet — Güçlü" },
    ],
    billing: "https://console.anthropic.com/settings/billing",
    keyUrl:  "https://console.anthropic.com/settings/keys",
    pricing: "Haiku $0.80/1M token · Sonnet $3/1M token",
  },
  {
    id: "openai",
    name: "OpenAI ChatGPT",
    badge: "Popüler",
    badgeColor: "bg-green-600/20 text-green-300 border-green-600/30",
    color: "green",
    placeholder: "sk-...",
    prefix: "sk-",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini — Hızlı & Ucuz" },
      { id: "gpt-4o",      name: "GPT-4o — Güçlü" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo — En Ucuz" },
    ],
    billing: "https://platform.openai.com/settings/organization/billing",
    keyUrl:  "https://platform.openai.com/api-keys",
    pricing: "GPT-4o Mini $0.15/1M token · GPT-4o $2.5/1M token",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Ücretsiz Tier",
    badgeColor: "bg-blue-600/20 text-blue-300 border-blue-600/30",
    color: "blue",
    placeholder: "AIza...",
    prefix: "AIza",
    models: [
      { id: "gemini-2.5-flash",      name: "Gemini 2.5 Flash — Hızlı, ücretsiz tier" },
      { id: "gemini-2.5-pro",        name: "Gemini 2.5 Pro — Güçlü" },
      { id: "gemini-2.0-flash",      name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite — En ucuz" },
    ],
    billing: "https://aistudio.google.com/apikey",
    keyUrl:  "https://aistudio.google.com/apikey",
    pricing: "Flash ücretsiz tier · Pro $1.25/1M token",
  },
];

function detectProvider(key: string): string {
  if (!key) return "anthropic";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-"))     return "openai";
  if (key.startsWith("AIza"))    return "gemini";
  return "anthropic";
}

interface Props {
  currentKey?: string;
  onSave: (key: string, provider: string, model: string) => Promise<void>;
  compact?: boolean;
}

export default function ApiKeySetup({ currentKey, onSave, compact = false }: Props) {
  const [key, setKey]           = useState(currentKey || "");
  const [provider, setProvider] = useState(detectProvider(currentKey || ""));
  const [providerTouched, setProviderTouched] = useState(false);
  const [model, setModel]       = useState("");
  const [validating, setValidating] = useState(false);
  const [validResult, setValidResult] = useState<{ok: boolean; provider?: string; model?: string} | null>(null);
  const [saving, setSaving]     = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const prov = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0];

  // Key değişince validation reset; provider'i sadece kullanıcı manuel seçmediyse otomatik tespit et
  useEffect(() => {
    setValidResult(null);
    if (!providerTouched) {
      const detected = detectProvider(key);
      if (detected !== provider) setProvider(detected);
    }
  }, [key]);

  // Provider değişince ilk modele set et (kullanıcı manuel model seçtiyse koru)
  useEffect(() => {
    const provDef = PROVIDERS.find(p => p.id === provider);
    if (!provDef) return;
    const isValidForProvider = provDef.models.some(m => m.id === model);
    if (!isValidForProvider) setModel(provDef.models[0]?.id || "");
  }, [provider]);

  const maskKey = (k: string) => k.length < 20 ? k : k.slice(0,12) + "..." + k.slice(-6);

  const validateKey = async () => {
    if (!key.trim()) return;
    setValidating(true);
    setValidResult(null);
    try {
      const res = await fetch("/api/validate-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key.trim() }),
      });
      const data = await res.json();
      setValidResult({ ok: data.valid === true, provider: data.provider, model: data.model });
    } catch { setValidResult({ ok: false }); }
    setValidating(false);
  };

  const handleSave = async () => {
    if (!key.trim()) return;
    setSaving(true);
    try { await onSave(key.trim(), provider, model || prov.models[0]?.id || ""); }
    catch (e) { console.error(e); }
    setSaving(false);
  };

  if (compact && currentKey) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-green-600/10 border border-green-600/20 rounded-lg px-3 py-2 text-xs">
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          <span className="text-green-300 font-mono">{maskKey(currentKey)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mevcut key durumu */}
      {currentKey ? (
        <div className="flex items-center gap-2 bg-green-600/10 border border-green-600/20 rounded-xl px-4 py-3 text-xs">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-green-300">Aktif: {maskKey(currentKey)}</span>
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full border ${prov.badgeColor}`}>{prov.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-orange-600/10 border border-orange-600/20 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 text-orange-400" />
          <span className="text-orange-300">API Key girilmedi. AI özellikleri için gerekli.</span>
        </div>
      )}

      {/* Provider seçimi */}
      <div>
        <label className="text-[11px] text-gray-400 block font-medium mb-2">AI Sağlayıcı Seç</label>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => { setProviderTouched(true); setProvider(p.id); setModel(p.models[0].id); }}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-center transition-all ${
                provider === p.id
                  ? "border-blue-500/50 bg-blue-600/10 text-white"
                  : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
              }`}>
              <span className="text-xs font-medium">{p.name}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${p.badgeColor}`}>{p.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Model seçimi */}
      <div>
        <label className="text-[11px] text-gray-400 block font-medium mb-1">Model</label>
        <select value={model} onChange={e => setModel(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50">
          {prov.models.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <p className="text-[10px] text-gray-600 mt-1">{prov.pricing}</p>
      </div>

      {/* Key input */}
      <div>
        <label className="text-[11px] text-gray-400 block font-medium mb-1">API Key</label>
        <div className="flex gap-2">
          <input type="password" value={key}
            onChange={e => setKey(e.target.value)}
            placeholder={prov.placeholder}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 placeholder-gray-700 font-mono" />
          <button onClick={validateKey} disabled={validating || !key.trim()}
            className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors">
            {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            Doğrula
          </button>
        </div>
        {validResult?.ok === true && (
          <div className="flex items-center gap-2 text-xs text-green-400 mt-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Geçerli! ({validResult.provider} / {validResult.model})
          </div>
        )}
        {validResult?.ok === false && (
          <div className="flex items-center gap-2 text-xs text-red-400 mt-1">
            <XCircle className="w-3.5 h-3.5" /> Geçersiz key. Kontrol edip tekrar deneyin.
          </div>
        )}
      </div>

      {/* Kılavuz */}
      <button onClick={() => setShowGuide(!showGuide)}
        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
        <Key className="w-3.5 h-3.5" />
        {prov.name} API Key nasıl alınır?
        <ChevronRight className={`w-3 h-3 transition-transform ${showGuide ? "rotate-90" : ""}`} />
      </button>
      {showGuide && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4 space-y-3 text-xs">
          <p className="text-gray-400">1. <a href={prov.keyUrl} target="_blank" className="text-blue-400 hover:underline" rel="noreferrer">API Key sayfasına git <ExternalLink className="inline w-3 h-3" /></a></p>
          <p className="text-gray-400">2. Yeni key oluştur ve kopyala</p>
          {provider !== "gemini" && (
            <p className="text-gray-400">3. <a href={prov.billing} target="_blank" className="text-blue-400 hover:underline" rel="noreferrer">Bakiye yükle <ExternalLink className="inline w-3 h-3" /></a></p>
          )}
          {provider === "gemini" && (
            <p className="text-green-400">✨ Gemini ücretsiz tier ile başlayabilirsin!</p>
          )}
        </div>
      )}

      {/* Kaydet */}
      <button onClick={handleSave} disabled={saving || !key.trim()}
        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4" /> Kaydet</>}
      </button>
    </div>
  );
}
