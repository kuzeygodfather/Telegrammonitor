"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, VolumeX, Vibrate, Moon, Loader2, Check, AlertTriangle, Info, Zap, Clock, Save } from "lucide-react";

const VAPID_PUBLIC_KEY = "BFC1xpHgyCLK3_R9zNnbeCD9iOQroG_n4TaYzLVQmxgRJqojzDwMgb7vnQdiY01WjzfjbuiEiiGkjcwJnSNpOo0";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

interface Prefs {
  enabled: boolean; sound: boolean; vibrate: boolean;
  sorun: boolean; onay: boolean; aksiyon: boolean; bilgi: boolean;
  quiet_start: string | null; quiet_end: string | null;
}

export default function NotificationSettings({ onSaved }: { onSaved?: () => void }) {
  const [prefs, setPrefs] = useState<Prefs>({ enabled: true, sound: true, vibrate: true, sorun: true, onay: true, aksiyon: true, bilgi: false, quiet_start: null, quiet_end: null });
  const [originalPrefs, setOriginalPrefs] = useState<Prefs | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) { setLoading(false); return; }
    setPermission(Notification.permission);
    loadPrefs();
    checkSubscription();
  }, []);

  useEffect(() => {
    if (originalPrefs) {
      setHasChanges(JSON.stringify(prefs) !== JSON.stringify(originalPrefs));
    }
  }, [prefs, originalPrefs]);

  const getUserId = () => { try { return JSON.parse(localStorage.getItem("tg_user") || "{}").id || 0; } catch { return 0; } };

  const loadPrefs = async () => {
    const uid = getUserId();
    if (!uid) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/notification-prefs?user_id=${uid}`);
      const data = await res.json();
      if (!data.error) { setPrefs(data); setOriginalPrefs(data); }
    } catch {}
    setLoading(false);
  };

  const checkSubscription = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Verify subscription exists in backend too
        const key = sub.toJSON();
        const res = await fetch("/api/push-subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: getUserId(), endpoint: key.endpoint, p256dh: key.keys?.p256dh || "", auth: key.keys?.auth || "" }),
        });
        setSubscribed(true);
      } else {
        setSubscribed(false);
      }
    } catch { setSubscribed(false); }
  };

  const subscribe = async () => {
    setSaving(true);
    try {
      // Step 0: Unsubscribe any existing old subscription first
      try {
        const existingReg = await navigator.serviceWorker.ready;
        const existingSub = await existingReg.pushManager.getSubscription();
        if (existingSub) await existingSub.unsubscribe();
      } catch {}

      // Step 1: Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        alert("Bildirim izni verilmedi. Tarayici ayarlarindan izin verin.");
        setSaving(false);
        return;
      }

      // Step 2: Check service worker
      if (!("serviceWorker" in navigator)) {
        alert("Service Worker desteklenmiyor.");
        setSaving(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      // Step 3: Subscribe to push
      let sub;
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      } catch (pushErr) {
        alert("Push abonelik hatasi: " + String(pushErr));
        setSaving(false);
        return;
      }

      // Step 4: Save to backend
      const key = sub.toJSON();
      const res = await fetch("/api/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: getUserId(),
          endpoint: key.endpoint,
          p256dh: key.keys?.p256dh || "",
          auth: key.keys?.auth || "",
        }),
      });
      const result = await res.json();

      if (result.success) {
        setSubscribed(true);
      } else {
        alert("Backend kayit hatasi: " + JSON.stringify(result));
      }
    } catch (e) {
      alert("Bildirim aktiflestime hatasi: " + String(e));
      console.error("Push subscribe error:", e);
    }
    setSaving(false);
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { const key = sub.toJSON(); await sub.unsubscribe();
        await fetch("/api/push-unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: getUserId(), endpoint: key.endpoint || "", p256dh: "", auth: "" }) }); }
      setSubscribed(false);
    } catch {}
  };

  const updatePref = (updates: Partial<Prefs>) => {
    setPrefs(prev => ({ ...prev, ...updates }));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await fetch("/api/notification-prefs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: getUserId(), ...prefs }) });
      setOriginalPrefs({ ...prefs });
      setHasChanges(false);
      if (onSaved) onSaved();
    } catch {}
    setSaving(false);
  };

  const sendTest = async () => {
    setTestSent(false);
    await fetch("/api/send-push", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: getUserId(), title: "Test Bildirimi", body: "Bildirimler calisiyor!", url: "/alerts", durum: "SORUN" }) });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  if (!("Notification" in window)) return <div className="text-xs text-gray-500">Tarayiciniz bildirimleri desteklemiyor.</div>;
  if (loading) return <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Yukleniyor...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {subscribed ? <Bell className="w-5 h-5 text-green-400" /> : <BellOff className="w-5 h-5 text-gray-500" />}
          <div>
            <p className="text-sm font-medium">{subscribed ? "Bildirimler Aktif" : "Bildirimler Kapali"}</p>
            <p className="text-[10px] text-gray-500">{permission === "denied" ? "Tarayici izni reddedildi" : subscribed ? "Push bildirimleri aliyorsunuz" : "Aktiflestirebilirsiniz"}</p>
          </div>
        </div>
        <button onClick={subscribed ? unsubscribe : subscribe} disabled={permission === "denied"}
          className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${subscribed ? "bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-600/30" : "bg-green-600 hover:bg-green-500 text-white"}`}>
          {subscribed ? "Kapat" : "Aktifle"}
        </button>
      </div>

      {subscribed && (<>
        <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-700/50 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300">Bildirim Turleri</h4>
          {[
            { key: "sorun" as const, label: "Sorunlar", color: "text-red-400" },
            { key: "onay" as const, label: "Onay Bekleyenler", color: "text-amber-400" },
            { key: "aksiyon" as const, label: "Aksiyon Gerekli", color: "text-orange-400" },
            { key: "bilgi" as const, label: "Bilgi", color: "text-sky-400" },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between cursor-pointer py-1">
              <span className={`text-xs ${item.color}`}>{item.label}</span>
              <button onClick={() => updatePref({ [item.key]: !prefs[item.key] })}
                className={`relative w-10 h-5 rounded-full transition-colors ${prefs[item.key] ? "bg-blue-600" : "bg-gray-700"}`}>
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: prefs[item.key] ? "22px" : "2px" }} />
              </button>
            </label>
          ))}
        </div>

        <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-700/50 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300">Ses ve Titresim</h4>
          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">{prefs.sound ? <Volume2 className="w-3.5 h-3.5 text-blue-400" /> : <VolumeX className="w-3.5 h-3.5 text-gray-500" />} Bildirim Sesi</span>
            <button onClick={() => updatePref({ sound: !prefs.sound })} className={`relative w-10 h-5 rounded-full transition-colors ${prefs.sound ? "bg-blue-600" : "bg-gray-700"}`}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: prefs.sound ? "22px" : "2px" }} />
            </button>
          </label>
          <label className="flex items-center justify-between cursor-pointer py-1">
            <span className="text-xs text-gray-400 flex items-center gap-1.5"><Vibrate className="w-3.5 h-3.5 text-purple-400" /> Titresim</span>
            <button onClick={() => updatePref({ vibrate: !prefs.vibrate })} className={`relative w-10 h-5 rounded-full transition-colors ${prefs.vibrate ? "bg-blue-600" : "bg-gray-700"}`}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: prefs.vibrate ? "22px" : "2px" }} />
            </button>
          </label>
        </div>

        <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-700/50 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 flex items-center gap-1.5"><Moon className="w-3.5 h-3.5 text-indigo-400" /> Sessiz Saatler</h4>
          <div className="flex items-center gap-3">
            <input type="time" value={prefs.quiet_start || ""} onChange={(e) => updatePref({ quiet_start: e.target.value || null })} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
            <span className="text-xs text-gray-500">-</span>
            <input type="time" value={prefs.quiet_end || ""} onChange={(e) => updatePref({ quiet_end: e.target.value || null })} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500" />
            {prefs.quiet_start && <button onClick={() => updatePref({ quiet_start: null, quiet_end: null })} className="text-[10px] text-gray-600 hover:text-red-400">Kaldir</button>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={saveAll} disabled={saving || !hasChanges}
            className={`flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all ${hasChanges ? "bg-green-600 hover:bg-green-500 text-white" : "bg-gray-700/50 text-gray-500"}`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Kaydediliyor..." : hasChanges ? "Kaydet" : "Kaydedildi"}
          </button>
          <button onClick={sendTest} className="px-4 py-2.5 rounded-xl text-xs bg-gray-700 hover:bg-gray-600 flex items-center gap-1.5">
            {testSent ? <><Check className="w-3.5 h-3.5 text-green-400" /> OK</> : <><Bell className="w-3.5 h-3.5" /> Test</>}
          </button>
        </div>
      </>)}
    </div>
  );
}
