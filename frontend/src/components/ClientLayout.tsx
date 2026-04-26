"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { ToastProvider } from "./Toast";
import { useWebSocket } from "@/lib/websocket";
import { getStats } from "@/lib/api";
import { isLoggedIn, getUser, supabase } from "@/lib/supabase";
import { Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import InstallPrompt from "./InstallPrompt";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWebSocket();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);

  // Token değişince Supabase client header'ını güncelle
  useEffect(() => {
    const syncToken = () => {
      const token = localStorage.getItem('tg_session_token') || '';
      // @ts-ignore
      if (supabase && supabase.rest && supabase.rest.headers) {
        // @ts-ignore
        supabase.rest.headers['x-session-token'] = token;
      }
    };
    syncToken();
    window.addEventListener('storage', syncToken);
    return () => window.removeEventListener('storage', syncToken);
  }, []);

  useEffect(() => {
    // Apply saved theme
    const savedTheme = localStorage.getItem("tg_theme");
    if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

    // Register service worker for PWA
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      // Listen for navigation messages from SW (push notification clicks)
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "NAVIGATE" && event.data.url) {
          window.location.href = event.data.url;
        }
      });
    }

    const path = window.location.pathname;
    if (path === "/register" || path === "/setup") {
      setChecked(true);
      return;
    }
    if (!isLoggedIn()) {
      window.location.href = "/register";
      return;
    }
    // Session token yoksa (eski/bozuk login), tg_user temizle ve register'a yonlendir.
    // Aksi takdirde Supabase RLS x-session-token bulamaz → tum sorgular bos doner.
    const sessTok = localStorage.getItem("tg_session_token");
    if (!sessTok) {
      localStorage.removeItem("tg_user");
      window.location.href = "/register";
      return;
    }
    setAuthed(true);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    getStats().then((s) => setUnreadAlerts(s.unread_alerts)).catch(() => {});
    const interval = setInterval(() => {
      getStats().then((s) => setUnreadAlerts(s.unread_alerts)).catch(() => {});
      // Session heartbeat
      const token = localStorage.getItem("tg_session_token");
      if (token) fetch("/api/session/heartbeat?token=" + token, { method: "POST" }).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [authed]);

  // Register/setup sayfasi - sidebar yok
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path === "/register" || path === "/setup") {
    return <ToastProvider>{children}</ToastProvider>;
  }

  // Auth kontrolu bitmeden veya giris yapilmamissa
  if (!checked || !authed) {
    return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;
  }

  const user = getUser();

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="fixed top-3 left-3 z-50 p-2 bg-gray-800 rounded-lg border border-gray-700 lg:hidden">
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className={`fixed inset-0 z-40 lg:relative lg:inset-auto transition-transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
          <div className="lg:hidden fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10"><Sidebar unreadAlerts={unreadAlerts} /></div>
        </div>
        <main className="flex-1 p-3 sm:p-6 overflow-auto lg:ml-0">
          <div className="flex items-center justify-end gap-2 mb-3 text-xs">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className="text-gray-500">{isConnected ? "Canli" : "Bekleniyor..."}</span>
            {user && <span className="text-gray-600 ml-2">{user.username}</span>}
            <ThemeToggle />
          </div>
          {children}
        </main>
      </div>
      <InstallPrompt />
    </ToastProvider>
  );
}
