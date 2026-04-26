"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa_dismissed");
    if (dismissed && Date.now() - Number(dismissed) < 1 * 24 * 3600 * 1000) return;

    // iOS detection
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(isiOS);

    if (isiOS) {
      // Show iOS install guide after 5 seconds
      setTimeout(() => setShowBanner(true), 5000);
      return;
    }

    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setShowIOSGuide(false);
    localStorage.setItem("pwa_dismissed", String(Date.now()));
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 lg:left-auto lg:right-4 lg:w-96">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Uygulamayi Yukle</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">TG Monitor&apos;u ana ekrana ekleyerek uygulama gibi kullanin.</p>
          </div>
          <button onClick={handleDismiss} className="text-gray-600 hover:text-gray-400 p-1 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isIOS ? (
          <>
            {!showIOSGuide ? (
              <button onClick={() => setShowIOSGuide(true)} className="mt-3 w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Nasil Eklenir?
              </button>
            ) : (
              <div className="mt-3 space-y-2 text-xs text-gray-300">
                <div className="flex items-center gap-2"><span className="w-5 h-5 bg-blue-600/20 rounded flex items-center justify-center text-[10px] font-bold text-blue-400">1</span> Safari&apos;da Paylas butonuna tiklayin (kutu + ok)</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 bg-blue-600/20 rounded flex items-center justify-center text-[10px] font-bold text-blue-400">2</span> &quot;Ana Ekrana Ekle&quot; secenegini tiklayin</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 bg-blue-600/20 rounded flex items-center justify-center text-[10px] font-bold text-blue-400">3</span> &quot;Ekle&quot; butonuna tiklayin</div>
              </div>
            )}
          </>
        ) : (
          <button onClick={handleInstall} className="mt-3 w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> Simdi Yukle
          </button>
        )}
      </div>
    </div>
  );
}
