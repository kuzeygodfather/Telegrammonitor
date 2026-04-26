"use client";

import { useEffect, useState } from "react";
import { Settings, Users, Plus, Trash2, Key, Phone, Check, Copy, ExternalLink, Save, AlertTriangle, RefreshCw, Shield, ShieldCheck, ShieldX, UserCheck, UserX, Lock, KeyRound, ChevronDown, Bell, MessageSquare, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { getKeywords, createKeyword, deleteKeyword, toggleKeyword } from "@/lib/api";
import type { Keyword } from "@/types";
import ApiKeySetup from "@/components/ApiKeySetup";
import NotificationSettings from "@/components/NotificationSettings";
import AutoReplySettings from "@/components/AutoReplySettings";
import SessionManager from "@/components/SessionManager";
import { supabase as sb, getUserId } from "@/lib/supabase";

interface UserRecord { id: number; username: string; phone: string|null; is_active: boolean; is_admin: boolean; created_at: string; }

const CATEGORIES = [{ value: "brand", label: "Marka" }, { value: "issue", label: "Sorun" }, { value: "person", label: "Kisi" }, { value: "custom", label: "Ozel" }];

function ApiKeyLoader() {
  const [currentKey, setCurrentKey] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const uid = getUserId();
      if (!uid) { setLoaded(true); return; }
      try {
        const tok = localStorage.getItem("tg_session_token") || "";
        const r = await fetch("/api/users/me", { headers: { "x-session-token": tok } });
        const d = await r.json();
        if (d && d.user && d.user.api_key_masked) setCurrentKey(d.user.api_key_masked);
      } catch {}
      setLoaded(true);
    };
    load();
  }, []);

  if (!loaded) return <div className="text-xs text-gray-500">Yukleniyor...</div>;

  return (
    <ApiKeySetup
      currentKey={currentKey}
      onSave={async (key, provider, model) => {
        const tok = localStorage.getItem("tg_session_token") || "";
        const r = await fetch("/api/users/save-api-key", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-token": tok },
          body: JSON.stringify({ api_key: key, ai_provider: provider, ai_model: model }),
        });
        const d = await r.json();
        if (d.success) setCurrentKey(key);
      }}
    />
  );
}


function TelegramAccountSection() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState("");
  const [step, setStep] = useState<"idle"|"code"|"twofa">("idle");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectedName, setConnectedName] = useState("");
  const { toast } = useToast();
  const sb = supabase;

  useEffect(() => {
    const checkStatus = async () => {
      const uid = getUserId();
      if (!uid) return;
      const { data } = await sb.from("users").select("phone,username").eq("id", uid).single();
      if (data?.phone) setPhone(data.phone);
      if (data?.username) {
        try {
          const res = await fetch("/api/admin/check-session?username=" + data.username);
          const d = await res.json();
          if (d.authorized) { setIsConnected(true); setConnectedName(d.name || ""); }
        } catch {}
      }
    };
    checkStatus();
  }, []);

  const sendCode = async () => {
    setLoading(true); setMsg("");
    const uid = getUserId();
    const { data: udata } = await sb.from("users").select("username").eq("id", uid).single();
    const username = udata?.username || "";
    try {
      const res = await fetch("/api/setup/send-code", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim().replace(/\s/g, ""), username }) });
      const d = await res.json();
      if (d.success) { setStep("code"); setMsg("Kod gonderildi!"); }
      else setMsg(d.message || "Hata");
    } catch { setMsg("Baglanti hatasi"); }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true); setMsg("");
    const uid = getUserId();
    const { data: udata } = await sb.from("users").select("username").eq("id", uid).single();
    const username = udata?.username || "";
    try {
      const res = await fetch("/api/setup/verify-code", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim().replace(/\s/g, ""), code, password: twofa, username }) });
      const d = await res.json();
      if (d.success) {
        setIsConnected(true); setConnectedName(d.user?.name || "");
        setStep("idle"); toast("Telegram baglandi!");
        // Grupları otomatik çek
        const { data: udata2 } = await sb.from("users").select("id,username").eq("id", uid).single();
        if (udata2) {
          await fetch("/api/admin/fetch-groups", { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: udata2.id, username: udata2.username }) });
          toast("Gruplar cekiliyor...");
        }
      } else if (d.needs_password) { setStep("twofa"); setMsg("2FA sifrenizi girin"); }
      else setMsg(d.message || "Kod hatali");
    } catch { setMsg("Baglanti hatasi"); }
    setLoading(false);
  };

  const resendCode = async () => {
    setCode(""); setStep("idle"); await sendCode();
  };

  if (isConnected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-green-600/10 border border-green-600/20 rounded-xl px-3 py-2.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <div>
            <p className="text-xs font-medium text-green-300">Telegram Bagli</p>
            {connectedName && <p className="text-[10px] text-gray-400">{connectedName} · {phone}</p>}
          </div>
        </div>
        <button onClick={() => { setIsConnected(false); setStep("idle"); setMsg(""); }}
          className="text-[11px] text-gray-500 hover:text-orange-400">
          Yeniden Bagla
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {msg && <p className={`text-[11px] ${msg.includes("!") ? "text-green-400" : "text-red-400"}`}>{msg}</p>}

      {step === "idle" && (
        <>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Telefon Numarasi</label>
            <input type="tel" value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+905xxxxxxxxx"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 placeholder-gray-700" />
          </div>
          <button onClick={sendCode} disabled={loading || !phone.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Kod Gonder"}
          </button>
        </>
      )}

      {(step === "code" || step === "twofa") && (
        <>
          <div>
            <label className="text-[11px] text-gray-400 block mb-1">Telegram Kodu</label>
            <input type="text" value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="12345"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-lg text-center tracking-widest focus:outline-none focus:border-blue-500/50 font-mono" />
          </div>
          {step === "twofa" && (
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">2FA Sifresi</label>
              <input type="password" value={twofa} onChange={e => setTwofa(e.target.value)}
                placeholder="2FA sifreniz"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50" />
            </div>
          )}
          <button onClick={verifyCode} disabled={loading || !code}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 py-2.5 rounded-xl text-xs font-medium">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "Dogrula"}
          </button>
          <div className="flex gap-2">
            <button onClick={resendCode} disabled={loading}
              className="flex-1 text-[11px] text-blue-400 hover:text-blue-300 py-1.5 border border-blue-500/20 rounded-lg">
              Yeniden Kod Gonder
            </button>
            <button onClick={() => { setStep("idle"); setCode(""); setMsg(""); }}
              className="flex-1 text-[11px] text-gray-500 hover:text-gray-300 py-1.5 border border-white/10 rounded-lg">
              Geri Don
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CreateUserPanel({ addUser, creating, newUser, setNewUser, newPwd, setNewPwd, toast: showToast, onRefresh }: {
  addUser: () => void; creating: boolean; newUser: string; setNewUser: (v: string) => void;
  newPwd: string; setNewPwd: (v: string) => void; toast: (msg: string) => void; onRefresh: () => void;
}) {
  const [step, setStep] = useState<"create"|"phone"|"code"|"done">("create");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdUsername, setCreatedUsername] = useState("");

  const handleCreate = async () => {
    await addUser();
    setCreatedUsername(newUser.toLowerCase());
    setStep("phone");
  };

  const sendCode = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/set-phone", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: 0, username: createdUsername, phone: phone.trim() }) });
      const data = await res.json();
      if (data.already_connected) { showToast("Telegram bagli!"); setStep("done"); onRefresh(); }
      else if (data.code_sent) { setStep("code"); showToast("Kod gonderildi"); }
      else showToast(data.error || "Hata");
    } catch { showToast("Hata"); }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/verify-code", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password: twofa, username: createdUsername }) });
      const data = await res.json();
      if (data.success) { showToast("Telegram baglandi!"); setStep("done"); onRefresh(); }
      else if (data.needs_password) showToast("2FA sifresi gerekli");
      else showToast(data.message || "Dogrulama basarisiz");
    } catch { showToast("Hata"); }
    setLoading(false);
  };

  const fetchGroups = async () => {
    setLoading(true);
    try {
      // Get user id from DB
      const { data: users } = await (await import("@/lib/supabase")).supabase.from("users").select("id").eq("username", createdUsername);
      const uid = users?.[0]?.id || 0;
      const res = await fetch("/api/admin/fetch-groups", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid, username: createdUsername }) });
      const data = await res.json();
      if (data.success) showToast(data.count + " grup cekildi");
      else showToast(data.error || "Hata");
    } catch { showToast("Hata"); }
    setLoading(false);
  };

  const reset = () => { setStep("create"); setPhone(""); setCode(""); setTwofa(""); setCreatedUsername(""); };

  const inputClass = "flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/50 placeholder-gray-700";

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" />Yeni Kullanici Olustur</h2>

      {/* Step indicator */}
      {step !== "create" && (
        <div className="flex items-center gap-1 mb-3">
          {[
            { k: "create", l: "Hesap" },
            { k: "phone", l: "Telefon" },
            { k: "code", l: "Dogrulama" },
            { k: "done", l: "Tamam" },
          ].map((s, i) => (
            <div key={s.k} className="flex items-center">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                step === s.k ? "bg-blue-600 text-white" :
                ["create","phone","code","done"].indexOf(step) > i ? "bg-green-600 text-white" : "bg-white/5 text-gray-600"
              }`}>{i + 1}</div>
              {i < 3 && <div className={`w-4 h-0.5 ${["create","phone","code","done"].indexOf(step) > i ? "bg-green-600" : "bg-white/5"}`} />}
            </div>
          ))}
          <span className="text-[10px] text-gray-500 ml-2">{createdUsername}</span>
        </div>
      )}

      {step === "create" && (
        <div className="flex gap-2">
          <input type="text" value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="Kullanici adi" className={inputClass} />
          <input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Sifre" className={inputClass} />
          <button onClick={async () => {
              // Check username availability first
              try {
                const res = await fetch("/api/admin/check-username?username=" + encodeURIComponent(newUser));
                const data = await res.json();
                if (!data.available) { showToast("Bu kullanici adi zaten alinmis!"); return; }
              } catch {}
              handleCreate();
            }} disabled={creating || !newUser || !newPwd}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
            <Plus className="w-3 h-3" />Olustur
          </button>
        </div>
      )}

      {step === "phone" && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">Kullanici olusturuldu. Simdi Telegram baglamak icin telefon numarasini girin.</p>
          <div className="flex gap-2">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+905xxxxxxxxx" className={inputClass} />
            <button onClick={sendCode} disabled={loading || !phone.trim()} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50">
              {loading ? "..." : "Kod Gonder"}
            </button>
            <button onClick={() => { reset(); onRefresh(); }} className="text-xs text-gray-500 hover:text-gray-300 px-2">Atla</button>
          </div>
        </div>
      )}

      {step === "code" && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500">Telegram uygulamasina gelen kodu girin.</p>
          <div className="flex gap-2">
            <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Telegram kodu" className={inputClass} />
            <input type="text" value={twofa} onChange={e => setTwofa(e.target.value)} placeholder="2FA sifresi (varsa)" className={inputClass} />
            <button onClick={verifyCode} disabled={loading || !code} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50">
              {loading ? "..." : "Dogrula"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-400">
            <Check className="w-4 h-4" /> <strong>{createdUsername}</strong> olusturuldu ve Telegram baglandi!
          </div>
          <div className="flex gap-2">
            <button onClick={fetchGroups} disabled={loading} className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-lg text-xs font-medium disabled:opacity-50">
              {loading ? "Cekiliyor..." : "Gruplari Cek"}
            </button>
            <button onClick={() => { reset(); onRefresh(); }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-xs">Bitti</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PendingUserCard({ user, onActivate, onDelete, onRefresh, onResetPassword, toast: showToast, isActive = false }: {
  user: { id: number; username: string; phone: string | null; created_at: string; is_admin?: boolean };
  onActivate: () => void; onDelete: () => void; onRefresh: () => void;
  onResetPassword?: () => void;
  toast: (msg: string) => void; isActive?: boolean;
}) {
  const [phoneInput, setPhoneInput] = useState(user.phone || "");
  const [showPhone, setShowPhone] = useState(false);
  const [codeStep, setCodeStep] = useState(false);
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [connected, setConnected] = useState(false);

  const sendCode = async () => {
    if (!phoneInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/set-phone", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, username: user.username, phone: phoneInput.trim() }) });
      const data = await res.json();
      if (data.already_connected) { setConnected(true); showToast(`${user.username} zaten Telegram bagli: ${data.name}`); }
      else if (data.code_sent) { setCodeStep(true); showToast("Kod gonderildi"); }
      else showToast(data.error || "Hata");
    } catch { showToast("Sunucu hatasi"); }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/verify-code", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput, code, password: twofa, username: user.username }) });
      const data = await res.json();
      if (data.success) { setConnected(true); setCodeStep(false); showToast("Telegram baglandi!"); }
      else if (data.needs_password) showToast("2FA sifresi gerekli");
      else showToast(data.message || "Dogrulama basarisiz");
    } catch { showToast("Hata"); }
    setLoading(false);
  };

  const fetchGroups = async () => {
    setFetchingGroups(true);
    try {
      const res = await fetch("/api/admin/fetch-groups", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, username: user.username }) });
      const data = await res.json();
      if (data.success) showToast(`${data.count} grup cekildi`);
      else showToast(data.error || "Hata");
    } catch { showToast("Hata"); }
    setFetchingGroups(false);
  };

  const activateWithPhone = async () => {
    setLoading(true);
    try {
      await fetch("/api/admin/activate-user", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, phone: phoneInput || user.phone || "" }) });
      showToast(`${user.username} aktif edildi`);
      onRefresh();
    } catch { showToast("Hata"); }
    setLoading(false);
  };

  return (
    <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/10 space-y-2">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? (user.phone ? "bg-green-600/10" : "bg-orange-600/10") : "bg-amber-500/10"}`}>
          {isActive ? (user.phone ? <UserCheck className="w-4 h-4 text-green-400" /> : <UserX className="w-4 h-4 text-orange-400" />) : <UserX className="w-4 h-4 text-amber-400" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{user.username}</span>
            {Boolean((user as {is_admin?: boolean}).is_admin) && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>}
            {isActive && user.phone && <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">TG BAGLI</span>}
            {isActive && !user.phone && <span className="text-[9px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">TG YOK</span>}
          </div>
          <p className="text-[10px] text-gray-500">{user.phone || "Telefon yok"} · {new Date(user.created_at).toLocaleDateString("tr-TR")}
            {connected && <span className="text-green-400 ml-1">· TG Bagli</span>}
          </p>
        </div>
        <button onClick={() => setShowPhone(!showPhone)} className="text-[10px] px-2 py-1 bg-blue-600/20 text-blue-300 rounded-lg hover:bg-blue-600/30">
          {showPhone ? "Kapat" : user.phone ? "Gruplari Yonet" : "Telefon Ekle"}
        </button>
        {!isActive && <button onClick={activateWithPhone} disabled={loading} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-xs font-medium text-white">
          <Check className="w-3 h-3" />Onayla
        </button>}
        {onResetPassword && <button onClick={onResetPassword} title="Sifre Sifirla" className="p-1.5 text-gray-600 hover:text-yellow-400"><KeyRound className="w-3.5 h-3.5" /></button>}
        {!((user as {is_admin?: boolean}).is_admin) && <button onClick={onDelete} className="p-1.5 text-gray-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
      </div>

      {showPhone && (
        <div className="ml-11 space-y-2 bg-gray-900/30 rounded-lg p-3 border border-gray-700/30">
          {!codeStep ? (
            <div className="flex gap-2 flex-wrap">
              <input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+905xxxxxxxxx" className="flex-1 min-w-[150px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
              {!user.phone && <button onClick={sendCode} disabled={loading || !phoneInput.trim()} className="bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">{loading ? "..." : "Kod Gonder"}</button>}
              {(connected || user.phone) && <button onClick={async () => {
                // Pre-check: is TG session actually authorized?
                try {
                  const chk = await fetch("/api/admin/check-session?username=" + encodeURIComponent(user.username));
                  const chkData = await chk.json();
                  if (!chkData.authorized) {
                    showToast("Telegram baglantisi yok! Once telefon dogrulamasi yapin.");
                    return;
                  }
                } catch {}
                fetchGroups();
              }} disabled={fetchingGroups} className="bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">{fetchingGroups ? "Cekiliyor..." : "Gruplari Cek"}</button>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder="Telegram kodu" className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                <input value={twofa} onChange={e => setTwofa(e.target.value)} placeholder="2FA (varsa)" className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
                <button onClick={verifyCode} disabled={loading || !code} className="bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50">{loading ? "..." : "Dogrula"}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<"users" | "keywords" | "system">("users");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [keywords, setKw] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKw, setNewKw] = useState("");
  const [newCat, setNewCat] = useState("custom");
  const [registerUrl, setRegisterUrl] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openSection, setOpenSection] = useState<string|null>(null);
  const [totpQR, setTotpQR] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpVerifyCode, setTotpVerifyCode] = useState("");
  const [has2fa, setHas2fa] = useState(false);
  const [setting2fa, setSetting2fa] = useState(false);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      // Admin -> backend endpoint (RLS bypass), normal user -> sadece kendi kaydi
      const me = JSON.parse(localStorage.getItem("tg_user") || "{}");
      let usersData: unknown[] = [];
      if (me.is_admin) {
        const r = await fetch("/api/admin/users");
        if (r.ok) {
          const d = await r.json();
          usersData = Array.isArray(d.users) ? d.users : [];
        }
      } else {
        const r = await fetch("/api/users/me");
        if (r.ok) {
          const d = await r.json();
          if (d.user) usersData = [d.user];
        }
      }
      const kw = await getKeywords();
      setUsers(usersData as UserRecord[]);
      setKw(kw);
      setRegisterUrl(window.location.origin + "/register");
    } catch (e) {
      console.error("Settings fetch error:", e);
    }
    setLoading(false);
  };

  const refresh = async () => { setRefreshing(true); await fetchSettings(); await check2fa(); toast("Ayarlar guncellendi"); setRefreshing(false); };

  const check2fa = async () => {
    const user = JSON.parse(localStorage.getItem("tg_user") || "{}");
    if (!user.id) return;
    try {
      const res = await fetch(`/api/auth/has-2fa?user_id=${user.id}`);
      const data = await res.json();
      setHas2fa(data.has_2fa);
    } catch {}
  };

  const setup2fa = async () => {
    const user = JSON.parse(localStorage.getItem("tg_user") || "{}");
    setSetting2fa(true);
    try {
      const res = await fetch(`/api/auth/setup-2fa?user_id=${user.id}&username=${user.username}`, { method: "POST" });
      const data = await res.json();
      setTotpQR(data.qr_code);
      setTotpSecret(data.secret);
    } catch { toast("2FA kurulumu basarisiz", "error"); }
    setSetting2fa(false);
  };

  const verify2faSetup = async () => {
    const user = JSON.parse(localStorage.getItem("tg_user") || "{}");
    const res = await fetch("/api/auth/verify-2fa", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, code: totpVerifyCode }),
    });
    const data = await res.json();
    if (data.success) {
      setHas2fa(true);
      setTotpQR(""); setTotpSecret(""); setTotpVerifyCode("");
      toast("2FA basariyla aktif edildi");
    } else {
      toast("Kod hatali, tekrar deneyin", "error");
    }
  };

  const remove2fa = async () => {
    if (!confirm("2FA'yi kapatmak istediginize emin misiniz?")) return;
    const user = JSON.parse(localStorage.getItem("tg_user") || "{}");
    await fetch(`/api/auth/remove-2fa?user_id=${user.id}`, { method: "POST" });
    setHas2fa(false);
    toast("2FA kapatildi");
  };

  useEffect(() => { fetchSettings(); check2fa(); }, []);

  const hashPwd = async (pwd: string) => {
    const data = new TextEncoder().encode(pwd);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const addUser = async () => {
    if (!newUser || !newPwd) return;
    setCreating(true);
    try {
      const r = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUser.toLowerCase(), password: newPwd }),
      });
      const d = await r.json();
      if (!d.success) {
        toast(d.message || "Hata", "error");
      } else {
        await fetchSettings();  // listeyi yenile
        setNewUser(""); setNewPwd("");
        toast("Kullanici olusturuldu (onay bekliyor)");
      }
    } catch (e) {
      toast("Hata: " + String(e), "error");
    }
    setCreating(false);
  };

  const deleteUser = async (id: number) => {
    const user = users.find(u => u.id === id);
    if (!confirm(`"${user?.username}" kullanicisini ve tum verilerini silmek istediginize emin misiniz? Bu islem geri alinamaz!`)) return;
    try {
      await fetch("/api/admin/delete-user", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id, username: user?.username || "" }) });
      setUsers(p => p.filter(u => u.id !== id));
      toast("Kullanici ve tum verileri silindi");
    } catch { toast("Silme hatasi"); }
  };

  const toggleAdmin = async (id: number, current: boolean) => {
    await fetch("/api/admin/toggle-user", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, field: "is_admin", value: !current }),
    });
    setUsers(p => p.map(u => u.id === id ? { ...u, is_admin: !current } : u));
    toast(!current ? "Admin yetkisi verildi" : "Admin yetkisi kaldirildi");
  };

  const [resetTarget, setResetTarget] = useState<{id: number, username: string} | null>(null);

  const resetUserPassword = (id: number, username: string) => {
    setResetTarget({ id, username });
  };

  const toggleActive = async (id: number, current: boolean) => {
    await sb.from("users").update({ is_active: !current }).eq("id", id);
    setUsers(p => p.map(u => u.id === id ? { ...u, is_active: !current } : u));
    toast(!current ? "Hesap onaylandi ve aktif edildi" : "Hesap deaktif edildi");
  };

  const addKeyword = async () => {
    if (!newKw) return;
    await createKeyword(newKw, newCat);
    const kw = await getKeywords();
    setKw(kw);
    setNewKw("");
    toast("Keyword eklendi");
  };

  const removeKw = async (id: number) => { await deleteKeyword(id); setKw(p => p.filter(k => k.id !== id)); toast("Keyword silindi"); };
  const togKw = async (id: number) => { await toggleKeyword(id); setKw(p => p.map(k => k.id === id ? { ...k, is_active: !k.is_active } : k)); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

  const pendingUsers = users.filter(u => !u.is_active);
  const activeUsers = users.filter(u => u.is_active);

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSuccess={(msg) => { toast(msg); setResetTarget(null); }}
        onError={(msg) => toast(msg, "error")} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="w-6 h-6 text-gray-400" />Ayarlar</h1>
        <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50"><RefreshCw className={`w-4 h-4 text-gray-400 ${refreshing ? "animate-spin" : ""}`} /></button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {[
          { k: "users" as const, l: "Kullanicilar", i: Users, badge: pendingUsers.length },
          { k: "keywords" as const, l: "Anahtar Kelimeler", i: Key, badge: 0 },
          { k: "system" as const, l: "Sistem", i: Settings, badge: 0 },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${tab === t.k ? "bg-blue-600 text-white" : "bg-white/5 text-gray-500 hover:text-white"}`}>
            <t.i className="w-3.5 h-3.5" />{t.l}
            {t.badge > 0 && <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* KULLANICILAR */}
      {tab === "users" && (
        <div className="space-y-4">
          {/* Onay Bekleyenler */}
          {pendingUsers.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />Onay Bekleyen Hesaplar ({pendingUsers.length})
              </h2>
              <div className="space-y-2">
                {pendingUsers.map(u => (
                  <PendingUserCard key={u.id} user={u} onActivate={() => { toggleActive(u.id, false); }} onDelete={() => deleteUser(u.id)} onRefresh={fetchSettings} onResetPassword={() => resetUserPassword(u.id, u.username)} toast={toast} />
                ))}
              </div>
            </div>
          )}

          {/* Kayit linki */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
            <p className="text-xs text-blue-400 font-medium mb-2">Kayit Linki</p>
            <div className="flex gap-2">
              <input type="text" value={registerUrl} readOnly className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs" />
              <button onClick={() => { navigator.clipboard.writeText(registerUrl); toast("Link kopyalandi"); }} className="bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg text-xs flex items-center gap-1"><Copy className="w-3 h-3" />Kopyala</button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">Kullanici kayit oldugunda hesabi <b>onayiniz olmadan aktif olmaz</b>. Yukardaki listeden onaylayin.</p>
          </div>

          {/* Yeni kullanici olustur */}
          <CreateUserPanel addUser={addUser} creating={creating} newUser={newUser} setNewUser={setNewUser} newPwd={newPwd} setNewPwd={setNewPwd} toast={toast} onRefresh={fetchSettings} />

          {/* Aktif Kullanicilar */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Aktif Kullanicilar ({activeUsers.length})</h2>
            <div className="space-y-2">
              {activeUsers.map(u => (
                <PendingUserCard key={u.id} user={u} onActivate={() => {}} onDelete={() => deleteUser(u.id)} onRefresh={fetchSettings} onResetPassword={() => resetUserPassword(u.id, u.username)} toast={toast} isActive />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ANAHTAR KELIMELER */}
      {tab === "keywords" && (
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3">Anahtar Kelime Ekle</h2>
            <div className="flex gap-2">
              <input type="text" value={newKw} onChange={e => setNewKw(e.target.value)} onKeyDown={e => e.key === "Enter" && addKeyword()} placeholder="Anahtar kelime..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/50 placeholder-gray-700" />
              <select value={newCat} onChange={e => setNewCat(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <button onClick={addKeyword} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-xs flex items-center gap-1"><Plus className="w-3 h-3" />Ekle</button>
            </div>
          </div>
          {CATEGORIES.map(cat => {
            const items = keywords.filter(k => k.category === cat.value);
            if (items.length === 0) return null;
            return (
              <div key={cat.value} className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-gray-400 mb-2">{cat.label} ({items.length})</h3>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(k => (
                    <div key={k.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${k.is_active ? "bg-white/5 border-white/10" : "bg-white/[0.01] border-white/5 opacity-40 line-through"}`}>
                      <span>{k.keyword}</span>
                      <button onClick={() => togKw(k.id)} className={`w-3 h-3 rounded-full ${k.is_active ? "bg-green-500" : "bg-gray-600"}`} />
                      <button onClick={() => removeKw(k.id)} className="text-gray-600 hover:text-red-400"><Trash2 className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SISTEM */}
      {tab === "system" && (
        <div className="space-y-4">
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "tg-account" ? null : "tg-account")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left">
              <span className="text-sm font-semibold flex items-center gap-2">
                <span>Telegram Hesabim</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "tg-account" ? "rotate-180" : ""}`} />
            </button>
            {openSection === "tg-account" && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                <TelegramAccountSection />
              </div>
            )}
          </div>
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "notif" ? null : "notif")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"><span className="text-sm font-semibold">Bildirim Ayarlari</span><ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "notif" ? "rotate-180" : ""}`} /></button>
            {openSection === "notif" && <div className="px-4 pb-4 border-t border-white/5 pt-3"><NotificationSettings onSaved={() => setOpenSection(null)} /></div>}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "auto" ? null : "auto")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"><span className="text-sm font-semibold">Otomatik Yanit</span><ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "auto" ? "rotate-180" : ""}`} /></button>
            {openSection === "auto" && <div className="px-4 pb-4 border-t border-white/5 pt-3"><p className="text-xs text-gray-400 mb-3">Etiketlendiginizde belirli sure icerisinde cevap vermezseniz otomatik mesaj gonderilir.</p><AutoReplySettings onSaved={() => setOpenSection(null)} /></div>}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "api" ? null : "api")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"><span className="text-sm font-semibold">AI Ayarlari (API Key)</span><ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "api" ? "rotate-180" : ""}`} /></button>
            {openSection === "api" && <div className="px-4 pb-4 border-t border-white/5 pt-3"><p className="text-xs text-gray-400 mb-3">AI ozellikleri icin API key gerekli. Temel izleme ucretsiz.</p><ApiKeyLoader /></div>}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "sys" ? null : "sys")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left"><span className="text-sm font-semibold">Sistem Bilgisi</span><ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "sys" ? "rotate-180" : ""}`} /></button>
            {openSection === "sys" && <div className="px-4 pb-4 border-t border-white/5 pt-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white/[0.02] rounded-lg p-3"><span className="text-gray-500">Analiz:</span> <span className="text-gray-300">Haiku tarama + Sonnet analiz</span></div>
              <div className="bg-white/[0.02] rounded-lg p-3"><span className="text-gray-500">Batch:</span> <span className="text-gray-300">500 Haiku / 100 Sonnet</span></div>
              <div className="bg-white/[0.02] rounded-lg p-3"><span className="text-gray-500">Temizlik:</span> <span className="text-gray-300">30dk otomatik</span></div>
              <div className="bg-white/[0.02] rounded-lg p-3"><span className="text-gray-500">Saat:</span> <span className="text-gray-300">Europe/Istanbul</span></div>
            </div>
            </div>}
          </div>

          {/* Bagli Cihazlar */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "devices" ? null : "devices")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left">
              <span className="text-sm font-semibold">Bagli Cihazlar</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "devices" ? "rotate-180" : ""}`} />
            </button>
            {openSection === "devices" && <div className="px-4 pb-4 border-t border-white/5 pt-3"><SessionManager /></div>}
          </div>

          {/* 2FA */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
            <button onClick={() => setOpenSection(openSection === "2fa" ? null : "2fa")} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors text-left">
              <span className="text-sm font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-blue-400" />2FA {has2fa ? <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">AKTIF</span> : <span className="text-[9px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded-full">KAPALI</span>}</span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openSection === "2fa" ? "rotate-180" : ""}`} />
            </button>
            {openSection === "2fa" && <div className="px-4 pb-4 border-t border-white/5 pt-3">

            {!has2fa && !totpQR && (
              <div>
                <p className="text-xs text-gray-400 mb-3">Giris yaparken Google Authenticator ile ek dogrulama kodu istenir. Hesabinizi daha guvenli yapar.</p>
                <button onClick={setup2fa} disabled={setting2fa} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium">
                  <Shield className="w-3.5 h-3.5" />{setting2fa ? "Hazirlaniyor..." : "2FA Kur"}
                </button>
              </div>
            )}

            {totpQR && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-4 w-fit mx-auto">
                  <img src={totpQR} alt="QR Code" className="w-48 h-48" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-1">Google Authenticator ile QR kodu okutun</p>
                  <p className="text-[10px] text-gray-600">veya bu kodu manuel girin:</p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <code className="text-xs bg-white/5 px-3 py-1 rounded font-mono text-amber-400">{totpSecret}</code>
                    <button onClick={() => { navigator.clipboard.writeText(totpSecret); toast("Kopyalandi"); }} className="text-gray-500 hover:text-white"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Dogrulama: Uygulamadaki 6 haneli kodu girin</p>
                  <div className="flex gap-2">
                    <input type="text" value={totpVerifyCode} onChange={e => setTotpVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000" maxLength={6}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-lg text-center tracking-[0.3em] font-mono focus:outline-none focus:border-blue-500/50 placeholder-gray-700" />
                    <button onClick={verify2faSetup} disabled={totpVerifyCode.length !== 6}
                      className="bg-green-600 hover:bg-green-500 disabled:bg-gray-800 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
                      <Check className="w-3 h-3" />Onayla
                    </button>
                  </div>
                </div>
                <button onClick={() => { setTotpQR(""); setTotpSecret(""); }} className="text-[10px] text-gray-600 hover:text-white">Iptal</button>
              </div>
            )}

            {has2fa && !totpQR && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400">2FA aktif - girisleriniz korunuyor</span>
                </div>
                <button onClick={remove2fa} className="text-[10px] text-gray-600 hover:text-red-400 px-2 py-1 bg-white/5 rounded-lg">2FA Kapat</button>
              </div>
            )}
            </div>}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" />Guvenlik</h2>
            <div className="text-xs text-gray-400 space-y-2">
              <p>Yeni kayitlar admin onayi olmadan aktif olmaz.</p>
              <p>Her kullanici kendi verisini gorur, baskasinin verisine erisemez.</p>
              <p>Telegram session'lar kullanici bazli ayrilmistir.</p>
            </div>
          </div>

          <SelfDeleteSection toast={toast} />
        </div>
      )}
    </div>
  );
}

function SelfDeleteSection({ toast }: { toast: (msg: string, type?: "success" | "error" | "info") => void }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const me = (typeof window !== "undefined")
    ? JSON.parse(localStorage.getItem("tg_user") || "{}")
    : {};
  if (me.is_admin) return null;  // admin self-delete'i panelden engelli

  const submit = async () => {
    if (confirmText !== "SIL") {
      toast("Onaylamak icin SIL yazin", "error");
      return;
    }
    if (!pwd) { toast("Sifre girin", "error"); return; }
    setLoading(true);
    try {
      const r = await fetch("/api/users/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      const d = await r.json();
      if (!d.success) {
        toast(d.message || "Hata", "error");
        setLoading(false);
        return;
      }
      // Logout + temizle
      localStorage.removeItem("tg_user");
      localStorage.removeItem("tg_session_token");
      window.location.href = "/register";
    } catch {
      toast("Sunucu hatasi", "error");
    }
    setLoading(false);
  };

  return (
    <div className="bg-red-600/[0.03] border border-red-600/20 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-red-600/[0.05] transition-colors text-left">
        <span className="text-sm font-semibold flex items-center gap-2 text-red-300">
          <AlertTriangle className="w-4 h-4" /> Tehlikeli Bolge
        </span>
        <ChevronDown className={`w-4 h-4 text-red-400/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-red-600/20 pt-3 space-y-3">
          <p className="text-xs text-red-300">
            Hesabini ve <strong>tum verilerini</strong> kalici olarak siler. Bu islem <strong>geri alinamaz</strong>.
            Tum mesajlarin, alert'lerin, raporlarin, anahtarin ve oturum bilgilerin sistemden kalici olarak kaldirilir.
          </p>
          <div>
            <label className="text-[10px] text-red-300/80">Sifren</label>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-900 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-[10px] text-red-300/80">Onaylamak icin <code className="font-mono text-red-400">SIL</code> yazin</label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="SIL"
              className="w-full bg-gray-900 border border-red-600/30 rounded-lg px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-red-500" />
          </div>
          <button
            disabled={loading || confirmText !== "SIL" || !pwd}
            onClick={submit}
            className="bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:text-red-700 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" />
            {loading ? "Siliniyor..." : "Hesabimi Kalici Olarak Sil"}
          </button>
        </div>
      )}
    </div>
  );
}


function ResetPasswordModal({
  target, onClose, onSuccess, onError,
}: {
  target: { id: number; username: string } | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modal acilinca state temizle
  useEffect(() => {
    if (target) { setPwd(""); setPwd2(""); setShowPwd(false); setSubmitting(false); }
  }, [target]);

  const genRandom = () => {
    const cs = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let p = "";
    const arr = new Uint32Array(14);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 14; i++) p += cs[arr[i] % cs.length];
    setPwd(p); setPwd2(p); setShowPwd(true);
  };

  const submit = async () => {
    if (!target) return;
    if (pwd.length < 8) { onError("Sifre en az 8 karakter olmali"); return; }
    if (pwd !== pwd2)   { onError("Sifreler eslesmiyor");           return; }
    setSubmitting(true);
    try {
      const r = await fetch("/api/admin/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: target.id, new_password: pwd }),
      });
      const d = await r.json();
      if (d.success) {
        onSuccess(`"${target.username}" sifresi sifirlandi. Tum oturumlari kapatildi.`);
      } else {
        onError(d.message || "Hata");
      }
    } catch {
      onError("Sunucu hatasi");
    }
    setSubmitting(false);
  };

  const copyPwd = async () => {
    try { await navigator.clipboard.writeText(pwd); onSuccess("Sifre panoya kopyalandi"); } catch { /* ignore */ }
  };

  if (!target) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#0a0a12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-yellow-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">Sifre Sifirla</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Kullanici: <span className="text-blue-400 font-mono">{target.username}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-xl p-3 flex gap-2 text-[11px] text-yellow-300/90">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Sifre degistiginde kullanicinin <strong>tum aktif oturumlari kapatilir</strong>. Yeni sifreyi kullaniciya guvenli bir kanaldan iletmen gerekir.</span>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Yeni Sifre <span className="text-gray-600">(en az 8 karakter)</span></label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-20 text-xs text-white focus:outline-none focus:border-blue-500/40 font-mono" />
              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                {pwd && (
                  <button onClick={copyPwd} title="Kopyala"
                    className="p-1 rounded text-gray-500 hover:text-blue-400">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setShowPwd(!showPwd)} title={showPwd ? "Gizle" : "Goster"}
                  className="p-1 rounded text-gray-500 hover:text-white text-[10px] font-mono">
                  {showPwd ? "•••" : "abc"}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Sifre (Tekrar)</label>
            <input
              type={showPwd ? "text" : "password"}
              value={pwd2}
              onChange={e => setPwd2(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/40 font-mono" />
            {pwd2 && pwd !== pwd2 && (
              <p className="text-[10px] text-red-400 mt-1">Sifreler eslesmiyor</p>
            )}
          </div>

          <button
            onClick={genRandom}
            className="w-full text-[11px] text-blue-400 hover:text-blue-300 py-1.5 border border-blue-500/20 rounded-lg hover:bg-blue-500/5 flex items-center justify-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Guvenli Sifre Uret
          </button>
        </div>

        <div className="px-5 py-3 bg-black/30 border-t border-white/5 flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-gray-400 hover:bg-white/5">
            Iptal
          </button>
          <button
            onClick={submit}
            disabled={submitting || pwd.length < 8 || pwd !== pwd2}
            className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-white/5 disabled:text-gray-700 text-black disabled:text-gray-700 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Sifrele
          </button>
        </div>
      </div>
    </div>
  );
}
