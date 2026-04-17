"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Bell, Users, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/StatCard";
import AlertItem from "@/components/AlertItem";
import { getStats, getRecentAlerts, getRecentMessages, markAlertRead } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { formatDateIST } from "@/lib/utils";
import type { DashboardStats, Alert, Message } from "@/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { realtimeAlerts } = useWebSocket();

  useEffect(() => {
    Promise.all([getStats(), getRecentAlerts(), getRecentMessages()])
      .then(([s, a, m]) => {
        setStats(s);
        setAlerts(a);
        setMessages(m);
      })
      .catch(() => {
        // Supabase baglantisi var ama henuz veri yok - bos dashboard goster
        setStats({
          total_messages_today: 0,
          total_alerts: 0,
          unread_alerts: 0,
          active_groups: 0,
          messages_by_hour: [],
        });
      })
      .finally(() => setLoading(false));
  }, []);

  // Merge realtime alerts
  const allAlerts = [...realtimeAlerts, ...alerts]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, 10);

  const handleMarkRead = async (id: number) => {
    await markAlertRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Bugunun Mesajlari"
          value={stats?.total_messages_today ?? 0}
          icon={MessageSquare}
          color="bg-blue-600"
        />
        <StatCard
          title="Toplam Uyari"
          value={stats?.total_alerts ?? 0}
          icon={Bell}
          color="bg-yellow-600"
        />
        <StatCard
          title="Okunmamis Uyari"
          value={stats?.unread_alerts ?? 0}
          icon={AlertTriangle}
          color="bg-red-600"
        />
        <StatCard
          title="Aktif Grup"
          value={stats?.active_groups ?? 0}
          icon={Users}
          color="bg-green-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saatlik Grafik */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Saatlik Mesaj Dagilimi</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats?.messages_by_hour || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                labelStyle={{ color: "#9CA3AF" }}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Son Uyarilar */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Son Uyarilar</h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {allAlerts.length === 0 ? (
              <p className="text-gray-500 text-sm">Henuz uyari yok</p>
            ) : (
              allAlerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onMarkRead={handleMarkRead} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Son Mesajlar */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Son Yakalanan Mesajlar</h2>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-gray-500 text-sm">Henuz mesaj yok</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="p-3 rounded-lg border border-gray-700 bg-gray-900">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span className="bg-gray-700 px-2 py-0.5 rounded">{msg.group_title}</span>
                  <span>{msg.sender_name}</span>
                  <span className="ml-auto">{formatDateIST(msg.date)}</span>
                </div>
                <p className="text-sm">{msg.text}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {msg.matched_keywords.map((kw) => (
                    <span key={kw} className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                      {kw}
                    </span>
                  ))}
                  {msg.analysis && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ml-auto ${
                        msg.analysis.sentiment === "negative" || msg.analysis.sentiment === "urgent"
                          ? "bg-red-900 text-red-300"
                          : msg.analysis.sentiment === "positive"
                            ? "bg-green-900 text-green-300"
                            : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {msg.analysis.summary}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
