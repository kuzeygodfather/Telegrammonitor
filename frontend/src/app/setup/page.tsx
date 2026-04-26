"use client";

import { useState, useEffect } from "react";
import { Radio, Phone, KeyRound, Bot, Rocket, CheckCircle, Loader2 } from "lucide-react";

const API = "http://localhost:8000";

interface SetupStatus {
  has_session: boolean;
  has_bot_token: boolean;
  has_admin_id: boolean;
  has_api_key: boolean;
  ready: boolean;
}

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Step 1: Phone
  const [phone, setPhone] = useState("");
  // Step 2: Code
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [userName, setUserName] = useState("");
  // Step 3: Settings
  const [botToken, setBotToken] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    fetch(`${API}/api/setup/status`)
      .then((r) => r.json())
      .then((s: SetupStatus) => {
        setStatus(s);
        if (s.has_session && s.has_api_key) setStep(4);
        else if (s.has_session) setStep(3);
      })
      .catch(() => setError("Kurulum sunucusuna baglanilamiyor. Backend calistigindan emin olun: cd backend && py setup_server.py"));
  }, []);

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/setup/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        setStep(2);
        setSuccess("Dogrulama kodu Telegram'a gonderildi!");
      } else {
        setError(data.message);
      }
    } catch {
      setError("Sunucuya baglanilamadi");
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/setup/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUserName(data.user?.name || "");
        setStep(3);
        setSuccess(`Giris basarili! Hosgeldin ${data.user?.name}`);
        setNeedsPassword(false);
      } else if (data.needs_password) {
        setNeedsPassword(true);
        setError("2FA aktif - lutfen sifrenizi girin");
      } else {
        setError(data.message);
      }
    } catch {
      setError("Sunucuya baglanilamadi");
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/setup/save-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: botToken,
          anthropic_api_key: apiKey,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStep(4);
        setSuccess("Ayarlar kaydedildi!");
      } else {
        setError(data.message);
      }
    } catch {
      setError("Sunucuya baglanilamadi");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Radio className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold">TG Monitor</h1>
          </div>
          <p className="text-gray-500">Telegram Takip Paneli - Kurulum</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step > s
                    ? "bg-green-600 text-white"
                    : step === s
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-500"
                }`}
              >
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-8 h-0.5 ${step > s ? "bg-green-600" : "bg-gray-800"}`} />}
            </div>
          ))}
        </div>

        {/* Error / Success */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}
        {success && !error && (
          <div className="bg-green-900/30 border border-green-800 text-green-300 rounded-lg p-3 mb-4 text-sm">
            {success}
          </div>
        )}

        {/* Step 1: Phone */}
        {step === 1 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Telegram Girisi</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Telegram hesabiniza baglanmak icin telefon numaranizi girin.
              Mesajlarinizi okuyabilmemiz icin gerekli.
            </p>
            <input
              type="tel"
              placeholder="+905xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            <button
              onClick={sendCode}
              disabled={loading || !phone}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Dogrulama Kodu Gonder
            </button>
          </div>
        )}

        {/* Step 2: Code */}
        {step === 2 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <KeyRound className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Dogrulama Kodu</h2>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Telegram uygulamaniza gelen dogrulama kodunu girin.
            </p>
            <input
              type="text"
              placeholder="12345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4 text-center text-2xl tracking-widest"
            />
            {needsPassword && (
              <input
                type="password"
                placeholder="2FA Sifresi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              />
            )}
            <button
              onClick={verifyCode}
              disabled={loading || !code}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Dogrula
            </button>
          </div>
        )}

        {/* Step 3: Settings */}
        {step === 3 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <Bot className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold">Ek Ayarlar</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Telegram Bot Token <span className="text-gray-600">(opsiyonel - DM bildirimleri icin)</span>
                </label>
                <input
                  type="text"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-600 mt-1">@BotFather&apos;dan alinir. Acil uyarilar Telegram DM olarak gelir.</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Claude API Key <span className="text-gray-600">(zaten girilmis olabilir)</span>
                </label>
                <input
                  type="password"
                  placeholder="sk-ant-api03-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              onClick={saveSettings}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mt-6"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Kaydet ve Devam Et
            </button>
            <button
              onClick={() => setStep(4)}
              className="w-full text-gray-500 hover:text-gray-300 px-4 py-2 text-sm mt-2 transition-colors"
            >
              Atla - sonra ayarlarim
            </button>
          </div>
        )}

        {/* Step 4: Ready */}
        {step === 4 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 text-center">
            <Rocket className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Kurulum Tamamlandi!</h2>
            <p className="text-sm text-gray-400 mb-6">
              {userName ? `${userName}, ` : ""}Telegram Monitor kullanima hazir.
              <br />
              Backend baslatildiginda tum gruplar dinlenmeye baslanacak.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 text-left text-sm mb-4">
              <p className="text-gray-400 mb-2">Backend&apos;i baslatmak icin:</p>
              <code className="text-green-400">cd backend && py main.py</code>
            </div>
            <a
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Panele Git
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
