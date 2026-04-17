"use client";

import { useEffect, useState } from "react";
import { FileText, MessageSquare, AlertTriangle, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { getStats, getRecentMessages, getAlerts } from "@/lib/api";
import type { DashboardStats, Message, Alert } from "@/types";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22C55E",
  negative: "#EF4444",
  neutral: "#6B7280",
  urgent: "#F97316",
};

const CATEGORY_LABELS: Record<string, string> = {
  complaint: "Sikayet",
  mention: "Bahsetme",
  issue: "Sorun",
  info: "Bilgi",
  praise: "Ovgu",
  request: "Talep",
};

const PIE_COLORS = ["#3B82F6", "#EF4444", "#22C55E", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function ReportsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getRecentMessages(50), getAlerts({ page: 1 })])
      .then(([s, m, a]) => {
        setStats(s);
        setMessages(m);
        setAlerts(a.items);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Kategori dagilimi
  const categoryData = messages.reduce(
    (acc, msg) => {
      if (msg.analysis) {
        const cat = msg.analysis.category;
        acc[cat] = (acc[cat] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );
  const pieData = Object.entries(categoryData).map(([name, value]) => ({
    name: CATEGORY_LABELS[name] || name,
    value,
  }));

  // Sentiment dagilimi
  const sentimentData = messages.reduce(
    (acc, msg) => {
      if (msg.analysis) {
        const s = msg.analysis.sentiment;
        acc[s] = (acc[s] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  // En aktif gruplar
  const groupCounts = messages.reduce(
    (acc, msg) => {
      acc[msg.group_title] = (acc[msg.group_title] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const topGroups = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold">Raporlar</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kategori Dagilimi */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Kategori Dagilimi</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: "8px" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm text-center py-12">Yeterli veri yok</p>
          )}
        </div>

        {/* Sentiment Ozeti */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Duygu Analizi</h2>
          <div className="space-y-4 mt-6">
            {Object.entries(sentimentData).map(([sentiment, count]) => {
              const total = messages.filter((m) => m.analysis).length || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={sentiment}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{sentiment}</span>
                    <span className="text-gray-400">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: SENTIMENT_COLORS[sentiment] || "#6B7280",
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(sentimentData).length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">Yeterli veri yok</p>
            )}
          </div>
        </div>

        {/* En Aktif Gruplar */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            En Aktif Gruplar
          </h2>
          <div className="space-y-3">
            {topGroups.map(([name, count], i) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-600 w-6">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{name}</p>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-400">
                  <MessageSquare className="w-4 h-4" />
                  {count}
                </div>
              </div>
            ))}
            {topGroups.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">Veri yok</p>
            )}
          </div>
        </div>

        {/* Onemli Uyarilar Ozeti */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            Onemli Uyarilar
          </h2>
          <div className="space-y-3">
            {alerts.filter((a) => a.urgency >= 3).slice(0, 5).map((alert) => (
              <div key={alert.id} className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      alert.urgency >= 4 ? "bg-red-500" : "bg-yellow-500"
                    }`}
                  />
                  <span>{alert.group_title}</span>
                  <span className="ml-auto">Oncelik: {alert.urgency}/5</span>
                </div>
                <p className="text-sm">{alert.title}</p>
              </div>
            ))}
            {alerts.filter((a) => a.urgency >= 3).length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">Onemli uyari yok</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
