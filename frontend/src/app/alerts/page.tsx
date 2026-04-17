"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import AlertItem from "@/components/AlertItem";
import { getAlerts, markAlertRead, markAllAlertsRead } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import type { Alert } from "@/types";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [loading, setLoading] = useState(true);
  const { realtimeAlerts } = useWebSocket();

  const fetchAlerts = async () => {
    const params: Record<string, unknown> = {};
    if (filter === "unread") params.is_read = false;
    if (filter === "urgent") params.urgency_min = 4;
    const res = await getAlerts(params as Parameters<typeof getAlerts>[0]);
    setAlerts(res.items);
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const allAlerts = [...realtimeAlerts, ...alerts]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

  const handleMarkRead = async (id: number) => {
    await markAlertRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  const handleMarkAllRead = async () => {
    await markAllAlertsRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-yellow-400" />
          <h1 className="text-2xl font-bold">Uyarilar</h1>
        </div>
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg border border-gray-700 transition-colors"
        >
          <CheckCheck className="w-4 h-4" />
          Tumunu Okundu Isaretle
        </button>
      </div>

      {/* Filtreler */}
      <div className="flex gap-2">
        {[
          { key: "all" as const, label: "Tumu" },
          { key: "unread" as const, label: "Okunmamis" },
          { key: "urgent" as const, label: "Acil (4-5)" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              filter === f.key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alert Listesi */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : allAlerts.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
            <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Bu filtrede uyari bulunamadi</p>
          </div>
        ) : (
          allAlerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} onMarkRead={handleMarkRead} />
          ))
        )}
      </div>
    </div>
  );
}
