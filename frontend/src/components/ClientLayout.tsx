"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { useWebSocket } from "@/lib/websocket";
import { getStats } from "@/lib/api";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isConnected } = useWebSocket();
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    getStats()
      .then((s) => setUnreadAlerts(s.unread_alerts))
      .catch(() => {});

    const interval = setInterval(() => {
      getStats()
        .then((s) => setUnreadAlerts(s.unread_alerts))
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar unreadAlerts={unreadAlerts} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-end gap-2 mb-4 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-gray-500">
            {isConnected ? "Canli Baglanti" : "Baglanti Kesildi"}
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
