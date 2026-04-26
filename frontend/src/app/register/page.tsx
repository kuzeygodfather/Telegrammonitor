"use client";

import { useState, useEffect } from "react";
import { Radio, UserPlus, LogIn, Phone, KeyRound, Loader2, CheckCircle, Key, Shield, Activity, Bell, MessageSquare, BarChart3, Zap, Clock, Users, Wand2, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ApiKeySetup from "@/components/ApiKeySetup";
import Turnstile from "@/components/Turnstile";

const FEATURES = [
  { icon: Activity, title: "7/24 Canli Izleme", desc: "Telegram gruplari kesintisiz izlenir, her mesaj aninda islenir. Ucretsiz kullanilabilir." },
  { icon: Wand2, title: "AI Destekli Analiz", desc: "Claude AI mesajlari analiz eder: duygu, kategori, oncelik ve ozet cikarir. Opsiyonel AI destegi." },
  { icon: Bell, title: "Akilli Uyarilar", desc: "Anahtar kelime eslestirme ile onemli mesajlar aninda yakalanir. AI ile onceliklendirme opsiyonel." },
  { icon: MessageSquare, title: "Telegram Entegrasyon", desc: "Gruplardan okuma ve mesaj gonderme panelden yapilir. Tamamen ucretsiz." },
  { icon: Clock, title: "Vardiya Planlama", desc: "Manuel veya AI destekli otomatik shift olusturma. Excel/CSV ve resim destegi." },
  { icon: Shield, title: "Ucretsiz Baslama", desc: "Temel izleme ve keyword eslestirme tamamen ucretsiz. AI ozellikleri opsiyonel, istediginizde aktiflestirilir." },
];

const TESTIMONIALS = [
  { text: "Gruplardaki sorunlari aninda tespit edip mudahale edebiliyoruz. Ucretsiz basladik, sonra AI ekledik.", role: "Operasyon Muduru" },
  { text: "AI analizi opsiyonel ama harika. Keyword eslestirme bile tek basina cok ise yariyor.", role: "Destek Yoneticisi" },
  { text: "Vardiya planlamasi AI ile dakikalar icinde hazirlaniyor. Manuel de yapilabiliyor.", role: "IK Koordinatoru" },
];

export default function RegisterPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [featureIdx, setFeatureIdx] = useState(0);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twofa, setTwofa] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [needsTwofa, setNeedsTwofa] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [pendingUser, setPendingUser] = useState<Record<string, unknown> | null>(null);

  // Feature carousel
  useEffect(() => {
    const i = setInterval(() => setFeatureIdx(p => (p + 1) % FEATURES.length), 4000);
    return () => clearInterval(i);
  }, []);

  const hashPwd = async (pwd: string) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pwd);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleLogin = async () => {
    setLoading(true); setError("");
    if (captchaEnabled && !captchaToken) {
      setError("Lutfen guvenlik dogrulamasini tamamlayin"); setLoading(false); return;
    }
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.toLowerCase(), password, turnstile_token: captchaToken }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Giris basarisiz"); setLoading(false); return; }

      if (data.needs_2fa) {
        setPendingUser({ id: data.user_id, username: data.username, is_admin: data.is_admin });
        setNeedsTotp(true);
        setLoading(false);
        return;
      }

      if (!data.token || !data.user) { setError("Oturum tokeni alinamadi"); setLoading(false); return; }
      localStorage.setItem("tg_user", JSON.stringify(data.user));
      localStorage.setItem("tg_session_token", data.token);
      window.location.href = "/";
    } catch (e) { setError("Giris hatasi: " + String(e)); setLoading(false); }
  };

  const handleTotpVerify = async () => {
    if (!pendingUser || !totpCode) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/login-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: pendingUser.id, code: totpCode }),
      });
      const data = await res.json();
      if (!data.success || !data.token || !data.user) {
        setError(data.message || "Dogrulama kodu hatali");
        setLoading(false);
        return;
      }
      localStorage.setItem("tg_user", JSON.stringify(data.user));
      localStorage.setItem("tg_session_token", data.token);
      window.location.href = "/";
    } catch { setError("Dogrulama hatasi"); }
    setLoading(false);
  };

  const handleRegister = async () => {
    setLoading(true); setError("");
    if ((password || "").length < 8) {
      setError("Sifre en az 8 karakter olmali"); setLoading(false); return;
    }
    if (captchaEnabled && !captchaToken) {
      setError("Lutfen guvenlik dogrulamasini tamamlayin"); setLoading(false); return;
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.toLowerCase(), password, turnstile_token: captchaToken }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Kayit hatasi"); setLoading(false); return; }
      setStep(2); setSuccess("Hesap olusturuldu!"); setLoading(false);
    } catch (e) { setError("Kayit hatasi: " + String(e)); setLoading(false); }
  };

  const handleSendCode = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/setup/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, username: username.toLowerCase() }) });
      const data = await res.json();
      if (data.success) { setStep(3); setSuccess("Kod gonderildi!"); } else setError(data.message || "Kod gonderilemedi");
    } catch { setError("Sunucuya baglanilamadi"); }
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/setup/verify-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, code, password: twofa, username: username.toLowerCase() }) });
      const data = await res.json();
      if (data.success) { setStep(4); setSuccess("Telegram baglandi!"); }
      else if (data.needs_password) { setNeedsTwofa(true); setError("2FA sifrenizi girin"); }
      else setError(data.message || "Dogrulama basarisiz");
    } catch { setError("Sunucuya baglanilamadi"); }
    setLoading(false);
  };

  // API key kaydetme — register sirasinda hesap is_active=false oldugu icin login edemez.
  // Bu yuzden ozel endpoint /api/auth/register-api-key'e sifre ile gidiyoruz.
  const _saveKeyDuringRegister = async (k: string, prov: string, model: string) => {
    const r = await fetch("/api/auth/register-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.toLowerCase(),
        password,
        api_key: k,
        ai_provider: prov,
        ai_model: model,
      }),
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.message || "Kaydetme hatasi");
  };

  const handleSaveApiKey2 = async (k: string, prov?: string, model?: string) => {
    setLoading(true); setError("");
    try {
      await _saveKeyDuringRegister(k, prov || "", model || "");
      setStep(5); setSuccess("Kaydiniz tamamlandi!");
    } catch (e) {
      setStep(5); setSuccess("Kayit tamam. API key'i Ayarlar'dan ekleyebilirsiniz.");
    }
    setLoading(false);
  };
  const handleSaveApiKey = async () => {
    setLoading(true); setError("");
    try {
      await _saveKeyDuringRegister(apiKey, "", "");
      setStep(5); setSuccess("Kaydiniz tamamlandi!");
    } catch (e) {
      setStep(5); setSuccess("Kayit tamam. API key'i Ayarlar'dan ekleyebilirsiniz.");
    }
    setLoading(false);
  };

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 placeholder-gray-600 transition-colors";
  const btnClass = "w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all";

  return (
    <div className="min-h-screen bg-[#030712] flex">
      {/* ===== LEFT PANEL - Branding & Features ===== */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-[#030712] via-[#0c1222] to-[#0a1628] relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-blue-600/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-cyan-600/3 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top - Logo & Tagline */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">TG Monitor</h1>
                <p className="text-[11px] text-gray-500">Telegram Yonetici Asistani</p>
              </div>
            </div>
            <div className="mt-8 max-w-md">
              <h2 className="text-3xl font-bold leading-tight">
                Telegram Gruplarini
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400"> Yapay Zeka </span>
                ile Yonetin
              </h2>
              <p className="text-sm text-gray-400 mt-4 leading-relaxed">
                Yuzlerce gruptaki binlerce mesaji tek tek okumak yerine, anahtar kelime tespiti ve AI analizi ile onemli konulari tek bir panelden takip edin.
              </p>

              <div className="flex flex-wrap gap-3 mt-6">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300 font-medium">Temel Izleme Ucretsiz</span>
                </div>
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-purple-300 font-medium">AI Ozellikleri Opsiyonel</span>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-blue-300 font-medium">Coklu Kullanici</span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle - Feature Carousel */}
          <div className="my-8">
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                const isActive = i === featureIdx;
                return (
                  <div key={i} onClick={() => setFeatureIdx(i)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all duration-500 ${isActive ? "bg-blue-600/10 border-blue-500/30 scale-[1.02]" : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04]"}`}>
                    <Icon className={`w-5 h-5 mb-2 transition-colors ${isActive ? "text-blue-400" : "text-gray-600"}`} />
                    <h3 className={`text-sm font-semibold mb-1 transition-colors ${isActive ? "text-white" : "text-gray-400"}`}>{f.title}</h3>
                    <p className={`text-[11px] leading-relaxed transition-colors ${isActive ? "text-gray-300" : "text-gray-600"}`}>{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom - Testimonial */}
          <div className="max-w-md">
            <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-5">
              <div className="flex items-start gap-3">
                <div className="text-3xl text-blue-500/30 font-serif leading-none">&ldquo;</div>
                <div>
                  <p className="text-sm text-gray-300 italic leading-relaxed">{TESTIMONIALS[featureIdx % TESTIMONIALS.length].text}</p>
                  <p className="text-[10px] text-gray-600 mt-2">- {TESTIMONIALS[featureIdx % TESTIMONIALS.length].role}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-6 text-[10px] text-gray-600">
              <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Guvenli Baglanti</div>
              <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Gercek Zamanli</div>
              <div className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Coklu Kullanici</div>
              <div className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Ucretsiz Baslama</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RIGHT PANEL - Auth Forms ===== */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center"><Radio className="w-5 h-5" /></div>
              <h1 className="text-2xl font-bold tracking-tight">TG Monitor</h1>
            </div>
            <p className="text-xs text-gray-500">Telegram Yonetici Asistani</p>
          </div>

          {/* Welcome text */}
          <div className="mb-6">
            <h2 className="text-xl font-bold">{mode === "login" ? "Tekrar Hosgeldiniz" : "Hesap Olusturun"}</h2>
            <p className="text-xs text-gray-500 mt-1">{mode === "login" ? "Panele erisim icin giris yapin" : "Yeni bir hesap olusturup sisteme baglanin"}</p>
          </div>

          {/* Tab */}
          <div className="flex mb-6 bg-white/5 rounded-xl p-1">
            <button onClick={() => { setMode("login"); setStep(1); setError(""); setSuccess(""); setNeedsTotp(false); }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${mode === "login" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-gray-500 hover:text-gray-300"}`}>
              <LogIn className="w-3.5 h-3.5 inline mr-1.5" />Giris Yap
            </button>
            <button onClick={() => { setMode("register"); setStep(1); setError(""); setSuccess(""); }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${mode === "register" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" : "text-gray-500 hover:text-gray-300"}`}>
              <UserPlus className="w-3.5 h-3.5 inline mr-1.5" />Kayit Ol
            </button>
          </div>

          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 mb-4 text-xs flex items-center gap-2"><Shield className="w-4 h-4 flex-shrink-0" />{error}</div>}
          {success && !error && <div className="bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl p-3 mb-4 text-xs flex items-center gap-2"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}

          {/* ===== LOGIN FORM ===== */}
          {mode === "login" && !needsTotp && (
            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-6 space-y-4">
              <div>
                <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">Kullanici Adi</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="kullanici_adi" className={inputClass} />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">Sifre</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="********" className={inputClass} />
              </div>
              {captchaEnabled && (
                <div className="flex justify-center">
                  <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken("")} onError={() => setCaptchaToken("")} />
                </div>
              )}
              <button onClick={handleLogin} disabled={loading || !username || !password || (captchaEnabled && !captchaToken)} className={btnClass}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><LogIn className="w-4 h-4" /> Giris Yap</>}
              </button>
              <p className="text-center text-[10px] text-gray-600">Hesabiniz yok mu? <button onClick={() => { setMode("register"); setError(""); }} className="text-blue-400 hover:text-blue-300">Kayit olun</button></p>
            </div>
          )}

          {/* ===== 2FA ===== */}
          {mode === "login" && needsTotp && (
            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-6 space-y-4">
              <div className="text-center mb-2">
                <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-blue-600/20">
                  <KeyRound className="w-7 h-7 text-blue-400" />
                </div>
                <p className="text-sm font-semibold">Iki Faktorlu Dogrulama</p>
                <p className="text-[10px] text-gray-500 mt-1">Authenticator uygulamanizdan 6 haneli kodu girin</p>
              </div>
              <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && handleTotpVerify()} placeholder="000000" maxLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-blue-500/50 placeholder-gray-700 font-mono" />
              <button onClick={handleTotpVerify} disabled={loading || totpCode.length !== 6} className={btnClass}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Shield className="w-4 h-4" /> Dogrula</>}
              </button>
              <button onClick={() => { setNeedsTotp(false); setPendingUser(null); setTotpCode(""); }} className="w-full text-gray-600 text-xs hover:text-gray-400 py-1">Geri Don</button>
            </div>
          )}

          {/* ===== REGISTER FORM ===== */}
          {mode === "register" && (
            <div className="bg-white/[0.02] rounded-2xl border border-white/5 p-6 space-y-4">
              {/* Steps indicator */}
              <div className="flex items-center justify-center gap-1 mb-2">
                {[
                  { n: 1, l: "Hesap" },
                  { n: 2, l: "Telefon" },
                  { n: 3, l: "Kod" },
                  { n: 4, l: "API" },
                  { n: 5, l: "Tamam" },
                ].map((s, i) => (
                  <div key={s.n} className="flex items-center">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${step >= s.n ? "bg-blue-600 text-white" : "bg-white/5 text-gray-600"}`}>{s.n}</div>
                    {i < 4 && <div className={`w-6 h-0.5 transition-all ${step > s.n ? "bg-blue-600" : "bg-white/5"}`} />}
                  </div>
                ))}
              </div>

              {step === 1 && (<>
                <div>
                  <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">Kullanici Adi</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="kullanici_adi" className={inputClass} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 mb-1.5 block font-medium">Sifre <span className="text-gray-600 text-[10px]">(en az 8 karakter)</span></label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" className={inputClass} />
                </div>
                {captchaEnabled && (
                  <div className="flex justify-center">
                    <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken("")} onError={() => setCaptchaToken("")} />
                  </div>
                )}
                <button onClick={handleRegister} disabled={loading || !username || !password || (captchaEnabled && !captchaToken)} className={btnClass}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Devam <ChevronRight className="w-4 h-4" /></>}
                </button>
              </>)}

              {step === 2 && (<>
                <div className="text-center mb-2">
                  <div className="w-14 h-14 bg-green-600/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-green-600/20">
                    <Phone className="w-7 h-7 text-green-400" />
                  </div>
                  <p className="text-sm font-semibold">Telegram Baglantisi</p>
                  <p className="text-[10px] text-gray-500 mt-1">Gruplari okuyabilmek icin telefon numaranizi girin</p>
                </div>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+905xxxxxxxxx" className={`${inputClass} text-center`} />
                <button onClick={handleSendCode} disabled={loading || !phone} className={btnClass}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Kod Gonder <ChevronRight className="w-4 h-4" /></>}
                </button>
              </>)}

              {step === 3 && (<>
                <div className="text-center mb-2">
                  <div className="w-14 h-14 bg-orange-600/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-orange-600/20">
                    <KeyRound className="w-7 h-7 text-orange-400" />
                  </div>
                  <p className="text-sm font-semibold">Dogrulama Kodu</p>
                  <p className="text-[10px] text-gray-500 mt-1">Telegram uygulamaniza gelen kodu girin</p>
                </div>
                <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="12345"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-2xl text-center tracking-[0.5em] focus:outline-none focus:border-blue-500/50 placeholder-gray-700 font-mono" />
                {needsTwofa && (<>
                  <label className="text-[11px] text-gray-400 mb-1 block font-medium">2FA Sifresi</label>
                  <input type="password" value={twofa} onChange={e => setTwofa(e.target.value)} placeholder="2FA sifreniz" className={inputClass} />
                </>)}
                <button onClick={handleVerifyCode} disabled={loading || !code} className={btnClass}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Dogrula <ChevronRight className="w-4 h-4" /></>}
                </button>
                <div className="flex gap-2 mt-1">
                  <button onClick={async () => { setError(""); setSuccess(""); setLoading(true); try { const res = await fetch("/api/setup/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, username: username.toLowerCase() }) }); const d = await res.json(); if (d.success) setSuccess("Yeni kod gonderildi!"); else setError(d.message || "Kod gonderilemedi"); } catch { setError("Sunucuya baglanilamadi"); } setLoading(false); }} disabled={loading} className="flex-1 text-[11px] text-blue-400 hover:text-blue-300 py-2 border border-blue-500/20 rounded-lg hover:bg-blue-500/5 transition-all disabled:opacity-50">
                    {loading ? "Gonderiliyor..." : "Yeniden Kod Gonder"}
                  </button>
                  <button onClick={() => { setStep(2); setCode(""); setError(""); setSuccess(""); }} className="flex-1 text-[11px] text-gray-500 hover:text-gray-300 py-2 border border-white/10 rounded-lg hover:bg-white/5 transition-all">
                    Geri Don (Telefon)
                  </button>
                </div>
              </>)}

              {step === 4 && (
                <div>
                  <div className="text-center mb-4">
                    <p className="text-sm font-semibold">Claude API Key</p>
                    <p className="text-[10px] text-gray-500 mt-1">AI analiz icin kendi Anthropic API anahtarinizi olusturun</p>
                  </div>
                  <ApiKeySetup onSave={async (k, prov, model) => { setApiKey(k); await handleSaveApiKey2(k, prov, model); }} />
                  <button onClick={() => setStep(5)} className="w-full text-gray-600 text-xs hover:text-gray-400 py-2 mt-2">Sonra girerim, atla</button>
                </div>
              )}

              {step === 5 && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-green-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-green-600/20">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                  </div>
                  <h2 className="text-lg font-bold mb-2">Kaydiniz Tamamlandi!</h2>
                  <p className="text-xs text-gray-500 mb-6 leading-relaxed">Kaydınız tamamlandı! Yönetici hesabınızı onayladıktan sonra giriş yapabilirsiniz.<br/><span className="text-blue-400">Onay için yöneticinizle iletişime geçin.</span></p>
                  <button onClick={() => { setMode("login"); setStep(1); setError(""); setSuccess(""); }}
                    className="bg-blue-600 hover:bg-blue-500 px-8 py-3 rounded-xl text-sm font-medium inline-flex items-center gap-2 shadow-lg shadow-blue-600/20">
                    <LogIn className="w-4 h-4" /> Giris Yap
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-[10px] text-gray-700 mt-6">TG Monitor v1.0 - Telegram Yonetici Asistani</p>
        </div>
      </div>
    </div>
  );
}
