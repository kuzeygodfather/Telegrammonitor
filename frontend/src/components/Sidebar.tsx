"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import InstallButton from "./InstallButton";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bell, Users, FileText, Settings, Radio, Wrench, MessageSquare, LogOut, Terminal, UserCheck, Clock, BookOpen, Sparkles, Shield } from "lucide-react";
import { getUser } from "@/lib/supabase";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Uyari Merkezi", icon: Bell },
  { href: "/chat", label: "Telegram", icon: MessageSquare },
  { href: "/groups", label: "Gruplar", icon: Users },
  { href: "/reports", label: "Raporlar", icon: FileText },
  { href: "/personnel", label: "Personel Takip", icon: UserCheck },
  { href: "/smart-reply", label: "Akilli Mesaj", icon: Sparkles },
  { href: "/shifts", label: "Vardiyalar", icon: Clock, BookOpen, Sparkles },
  { href: "/settings", label: "Ayarlar", icon: Settings },
  { href: "/logs", label: "Sistem Loglari", icon: Terminal },
  { href: "/guide", label: "Kullanim Kilavuzu", icon: BookOpen },
];

const adminNav = [
  { href: "/audit", label: "Audit Log", icon: Shield },
];

export default function Sidebar({ unreadAlerts = 0 }: { unreadAlerts?: number }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const u = getUser();
    setIsAdmin(!!(u && u.is_admin));
  }, []);

  const handleLogout = async () => {
    const tok = localStorage.getItem("tg_session_token") || "";
    if (tok) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tok }),
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem("tg_user");
    localStorage.removeItem("tg_session_token");
    window.location.href = "/register";
  };

  return (
    <aside className="w-64 bg-[#0a0a12] text-gray-100 min-h-screen flex flex-col border-r border-white/5">
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Radio className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">TG Monitor</h1>
            <p className="text-[10px] text-gray-600 -mt-0.5">Telegram Takip Paneli</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? "bg-blue-600/10 text-blue-400 font-medium" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"}`}>
              {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-500 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />}
              <Icon className={`w-[18px] h-[18px] ${active ? "text-blue-400" : ""}`} />
              <span>{item.label}</span>
              {item.href === "/alerts" && unreadAlerts > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{unreadAlerts}</span>
              )}
            </Link>
          );
        })}
        {isAdmin && (
          <>
            <div className="px-3 pt-4 pb-1.5 text-[10px] text-gray-600 uppercase tracking-wider">Admin</div>
            {adminNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? "bg-purple-600/10 text-purple-400 font-medium" : "text-gray-500 hover:bg-white/5 hover:text-gray-300"}`}>
                  {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-purple-500 rounded-r-full shadow-[0_0_8px_rgba(168,85,247,0.6)]" />}
                  <Icon className={`w-[18px] h-[18px] ${active ? "text-purple-400" : ""}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-white/5">
        <InstallButton />
        <div className="flex items-center justify-between mb-2"><span className="text-[10px] text-gray-600">Tema</span><ThemeToggle /></div>
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-white hover:bg-red-500/10 transition-all">
          <LogOut className="w-3.5 h-3.5" />
          Cikis Yap
        </button>
      </div>
    </aside>
  );
}

