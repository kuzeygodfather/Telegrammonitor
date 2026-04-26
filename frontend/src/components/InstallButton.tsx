"use client";

import { useEffect, useState } from "react";
import { Smartphone, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSTip, setShowIOSTip] = useState(false);

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // iOS check
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    // Android/Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSTip(!showIOSTip);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (installed) return null;

  return (
    <div className="mb-2">
      <button onClick={handleInstall}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-blue-400 hover:text-white hover:bg-blue-600/20 border border-blue-600/20 hover:border-blue-600/40 transition-all">
        <Download className="w-3.5 h-3.5" />
        Uygulamayi Yukle
      </button>
      {showIOSTip && isIOS && (
        <div className="mt-1.5 bg-blue-600/10 border border-blue-600/20 rounded-lg p-2.5 text-[10px] text-blue-300 space-y-1">
          <p className="font-semibold">iOS Kurulum:</p>
          <p>1. Safari paylas butonu (kutu + ok)</p>
          <p>2. &quot;Ana Ekrana Ekle&quot; secin</p>
          <p>3. &quot;Ekle&quot; butonuna basin</p>
        </div>
      )}
    </div>
  );
}
