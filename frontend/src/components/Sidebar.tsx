"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  Users,
  FileText,
  Settings,
  Radio,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Uyarilar", icon: Bell },
  { href: "/groups", label: "Gruplar", icon: Users },
  { href: "/reports", label: "Raporlar", icon: FileText },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

export default function Sidebar({ unreadAlerts = 0 }: { unreadAlerts?: number }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 text-gray-100 min-h-screen flex flex-col border-r border-gray-800">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Radio className="w-6 h-6 text-blue-400" />
          <h1 className="text-lg font-bold">TG Monitor</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">Telegram Takip Paneli</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
              {item.href === "/alerts" && unreadAlerts > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {unreadAlerts}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
        Telegram Monitor v1.0
      </div>
    </aside>
  );
}
