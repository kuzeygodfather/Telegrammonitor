"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Bell, Users, AlertTriangle, Eye } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatCard from "@/components/StatCard";
import AlertItem from "@/components/AlertItem";
import { getStats, getRecentAlerts, getRecentMessages, markAlertRead } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket";
import { formatDateIST } from "@/lib/utils";
import type { DashboardStats, Alert, Message } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  complaint: "Sikayet",
  issue: "Sorun",
  financial: "Finansal",
  staff: "Personel",
  customer: "Musteri",
  technical: "Teknik",
  info: "Bilgi",
  decision: "Karar",
  praise: "Ovgu",
  mention: "Bahsetme",
  request: "Talep",
};

const CATEGORY_COLORS: Record<string, string> = {
  complaint: "bg-red-900 text-red-300",
  issue: "bg-orange-900 text-orange-300",
  financial: "bg-yellow-900 text-yellow-300",
  staff: "bg-purple-900 text-purple-300",
  customer: "bg-pink-900 text-pink-300",
  technical: "bg-cyan-900 text-cyan-300",
  decision: "bg-blue-900 text-blue-300",
  info: "bg-gray-700 text-gray-400",
  praise: "bg-green-900 text-green-300",
};

const URGENCY_BAR: Record<number, string> = {
  1: "bg-gray-600",
  2: "bg-blue-600",
  3: "bg-yellow-500",
  4: "bg-orange-500",
  5: "bg-red-500",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const { realtimeAlerts } = useWebSocket();

  useEffect(() => {
    Promise.all([getStats(), getRecentAlerts(15), getRecentMessages(30)])
      .then(([s, a, m]) => {
        setStats(s);
        setAlerts(a);
        setMessages(m);
      })
      .catch(() => {
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

  const allAlerts = [...realtimeAlerts, ...alerts]
    .filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i)
    .slice(0, 15);

  const handleMarkRead = async (id: number) => {
    await markAlertRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  // Onemli mesajlar (urgency >= 3 veya relevant_to_manager)
  const importantMessages = messages.filter(
    (m) => m.analysis && (m.analysis.urgency >= 3 || m.analysis.details?.relevant_to_manager)
  );
  const routineMessages = messages.filter(
    (m) => !m.analysis || (m.analysis.urgency < 3 && !m.analysis.details?.relevant_to_manager)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Yonetim Paneli</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Bugunun Mesajlari"
          value={stats?.total_messages_today ?? 0}
          icon={MessageSquare}
          color="bg-blue-600"
        />
        <StatCard
          title="Aktif Uyarilar"
          value={stats?.unread_alerts ?? 0}
          icon={AlertTriangle}
          color="bg-red-600"
        />
        <StatCard
          title="Izlenen Gruplar"
          value={stats?.active_groups ?? 0}
          icon={Users}
          color="bg-green-600"
        />
        <StatCard
          title="Onemli Konular"
          value={importantMessages.length}
          icon={Eye}
          color="bg-purple-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saatlik Grafik */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Saatlik Mesaj Yogunlugu (Istanbul)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats?.messages_by_hour || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={12} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }}
                labelStyle={{ color: "#9CA3AF" }}
                labelFormatter={(h) => `Saat: ${h}:00`}
              />
              <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Mesaj" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Son Uyarilar */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Dikkat Gerektiren Konular</h2>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {allAlerts.length === 0 ? (
              <p className="text-gray-500 text-sm">Simdilik dikkat gerektiren konu yok</p>
            ) : (
              allAlerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} onMarkRead={handleMarkRead} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Onemli Mesajlar */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">
          Sizi Ilgilendiren Mesajlar
          {importantMessages.length > 0 && (
            <span className="text-sm font-normal text-gray-500 ml-2">({importantMessages.length})</span>
          )}
        </h2>
        <div className="space-y-3">
          {importantMessages.length === 0 ? (
            <p className="text-gray-500 text-sm">Henuz onemli mesaj yok - backend baslatildiginda burada gorunecek</p>
          ) : (
            importantMessages.map((msg) => (
              <div key={msg.id} className="p-4 rounded-lg border border-gray-600 bg-gray-900">
                <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                  <span className="bg-gray-700 px-2 py-0.5 rounded">{msg.group_title}</span>
                  <span className="text-gray-500">{msg.sender_name}</span>
                  {msg.analysis && (
                    <>
                      <span className={`px-2 py-0.5 rounded ${CATEGORY_COLORS[msg.analysis.category] || "bg-gray-700 text-gray-400"}`}>
                        {CATEGORY_LABELS[msg.analysis.category] || msg.analysis.category}
                      </span>
                      {msg.analysis.details?.topic && (
                        <span className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">
                          {msg.analysis.details.topic}
                        </span>
                      )}
                    </>
                  )}
                  <span className="ml-auto text-gray-600">{formatDateIST(msg.date)}</span>
                </div>
                {/* Urgency bar */}
                {msg.analysis && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${URGENCY_BAR[msg.analysis.urgency] || "bg-gray-600"}`}
                        style={{ width: `${msg.analysis.urgency * 20}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{msg.analysis.urgency}/5</span>
                  </div>
                )}
                <p className="text-sm">{msg.text}</p>
                {msg.analysis?.summary && (
                  <p className="text-xs text-blue-400 mt-2 italic">AI: {msg.analysis.summary}</p>
                )}
                {msg.analysis?.details?.action_needed && msg.analysis.details.action_description && (
                  <p className="text-xs text-orange-400 mt-1">Aksiyon: {msg.analysis.details.action_description}</p>
                )}
                {msg.matched_keywords.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {msg.matched_keywords.map((kw) => (
                      <span key={kw} className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Genel Akis */}
      {routineMessages.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 text-gray-400">Genel Akis</h2>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {routineMessages.slice(0, 15).map((msg) => (
              <div key={msg.id} className="p-2 rounded border border-gray-700/50 bg-gray-900/50">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>{msg.group_title}</span>
                  <span>{msg.sender_name}</span>
                  <span className="ml-auto">{formatDateIST(msg.date)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 truncate">{msg.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
