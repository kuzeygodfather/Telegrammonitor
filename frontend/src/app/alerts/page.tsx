"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, Send, MessageSquare, User, Clock, Tag } from "lucide-react";
import { getDetailedAlerts, markAlertRead, markAllAlertsRead, sendReply } from "@/lib/api";
import { formatDateIST } from "@/lib/utils";

interface DetailedAlert {
  id: number;
  group_id: number;
  group_title: string;
  title: string;
  description: string;
  urgency: number;
  is_read: boolean;
  created_at: string;
  sender_name: string | null;
  sender_id: number | null;
  original_text: string | null;
  telegram_msg_id: number | null;
  message_date: string | null;
  matched_keywords: string[];
  summary: string | null;
  sentiment: string | null;
  category: string | null;
  topic: string | null;
  action_needed: boolean;
  action_description: string | null;
}

const URGENCY_COLORS: Record<number, string> = {
  1: "bg-gray-600", 2: "bg-blue-600", 3: "bg-yellow-500", 4: "bg-orange-500", 5: "bg-red-500",
};

const URGENCY_LABELS: Record<number, string> = {
  1: "Dusuk", 2: "Normal", 3: "Orta", 4: "Yuksek", 5: "Acil",
};

const CATEGORY_LABELS: Record<string, string> = {
  complaint: "Sikayet", issue: "Sorun", financial: "Finansal", staff: "Personel",
  customer: "Musteri", technical: "Teknik", info: "Bilgi", decision: "Karar", praise: "Ovgu",
};

const SENTIMENT_LABELS: Record<string, { label: string; color: string }> = {
  positive: { label: "Olumlu", color: "text-green-400" },
  negative: { label: "Olumsuz", color: "text-red-400" },
  neutral: { label: "Notr", color: "text-gray-400" },
  urgent: { label: "Acil", color: "text-orange-400" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<DetailedAlert[]>([]);
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<Record<number, boolean>>({});
  const [replySuccess, setReplySuccess] = useState<Record<number, boolean>>({});

  const fetchAlerts = async () => {
    const params: Record<string, unknown> = {};
    if (filter === "unread") params.is_read = false;
    if (filter === "urgent") params.urgency_min = 4;
    const res = await getDetailedAlerts(params as Parameters<typeof getDetailedAlerts>[0]);
    setAlerts(res.items as DetailedAlert[]);
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, [filter]);

  const handleMarkRead = async (id: number) => {
    await markAlertRead(id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  const handleMarkAllRead = async () => {
    await markAllAlertsRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  const handleReply = async (alert: DetailedAlert) => {
    const text = replyText[alert.id];
    if (!text?.trim()) return;

    setSending((p) => ({ ...p, [alert.id]: true }));
    try {
      await sendReply(alert.group_id, text.trim(), alert.telegram_msg_id || undefined);
      setReplyText((p) => ({ ...p, [alert.id]: "" }));
      setReplySuccess((p) => ({ ...p, [alert.id]: true }));
      setTimeout(() => setReplySuccess((p) => ({ ...p, [alert.id]: false })), 3000);
    } catch (e) {
      console.error("Cevap gonderme hatasi:", e);
    }
    setSending((p) => ({ ...p, [alert.id]: false }));
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
          className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg border border-gray-700"
        >
          <CheckCheck className="w-4 h-4" />
          Tumunu Okundu
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
              filter === f.key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Alert Listesi */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
            <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Bu filtrede uyari bulunamadi</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const isExpanded = expandedId === alert.id;
            const sentimentInfo = SENTIMENT_LABELS[alert.sentiment || "neutral"];

            return (
              <div
                key={alert.id}
                className={`rounded-xl border transition-colors ${
                  alert.is_read ? "bg-gray-800/50 border-gray-700" : "bg-gray-800 border-gray-600"
                }`}
              >
                {/* Header - her zaman gorunur */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Urgency badge */}
                    <div className={`px-2 py-1 rounded text-xs font-bold text-white ${URGENCY_COLORS[alert.urgency]}`}>
                      {alert.urgency}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Ust bilgi satiri */}
                      <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
                        <span className="bg-gray-700 px-2 py-0.5 rounded">{alert.group_title}</span>
                        {alert.sender_name && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <User className="w-3 h-3" />
                            {alert.sender_name}
                          </span>
                        )}
                        {alert.topic && (
                          <span className="bg-purple-900 text-purple-300 px-2 py-0.5 rounded">{alert.topic}</span>
                        )}
                        {alert.category && (
                          <span className="bg-gray-700 text-gray-400 px-2 py-0.5 rounded">
                            {CATEGORY_LABELS[alert.category] || alert.category}
                          </span>
                        )}
                        <span className={sentimentInfo?.color || "text-gray-400"}>
                          {sentimentInfo?.label || ""}
                        </span>
                        <span className="text-gray-600 ml-auto flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateIST(alert.created_at)}
                        </span>
                      </div>

                      {/* Baslik */}
                      <p className="text-sm font-medium">{alert.title}</p>

                      {/* Urgency label */}
                      <span className={`text-xs ${URGENCY_COLORS[alert.urgency]} text-white px-2 py-0.5 rounded mt-1 inline-block`}>
                        {URGENCY_LABELS[alert.urgency]}
                      </span>
                    </div>

                    {/* Okundu butonu */}
                    {!alert.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMarkRead(alert.id); }}
                        className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0"
                      >
                        Okundu
                      </button>
                    )}
                  </div>
                </div>

                {/* Detay - acilinca gorunur */}
                {isExpanded && (
                  <div className="border-t border-gray-700 p-4 space-y-4">
                    {/* Orijinal mesaj */}
                    {alert.original_text && (
                      <div className="bg-gray-900 rounded-lg p-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Orijinal Mesaj</span>
                          {alert.message_date && (
                            <span className="ml-auto">{formatDateIST(alert.message_date)}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-200">{alert.original_text}</p>
                        {alert.matched_keywords && alert.matched_keywords.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            <Tag className="w-3 h-3 text-yellow-500 mt-0.5" />
                            {alert.matched_keywords.map((kw: string) => (
                              <span key={kw} className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">{kw}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Ozet */}
                    {alert.summary && (
                      <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-800/30">
                        <p className="text-xs text-blue-400 mb-1">AI Analizi</p>
                        <p className="text-sm">{alert.summary}</p>
                      </div>
                    )}

                    {/* Aksiyon Onerisi */}
                    {alert.action_needed && alert.action_description && (
                      <div className="bg-orange-900/20 rounded-lg p-3 border border-orange-800/30">
                        <p className="text-xs text-orange-400 mb-1">Onerilen Aksiyon</p>
                        <p className="text-sm">{alert.action_description}</p>
                      </div>
                    )}

                    {/* Personel Bilgisi */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-gray-900 rounded-lg p-2">
                        <span className="text-gray-500">Gonderen:</span>
                        <span className="text-gray-200 ml-2">{alert.sender_name || "Bilinmeyen"}</span>
                      </div>
                      <div className="bg-gray-900 rounded-lg p-2">
                        <span className="text-gray-500">Grup:</span>
                        <span className="text-gray-200 ml-2">{alert.group_title}</span>
                      </div>
                    </div>

                    {/* Cevap Yazma */}
                    <div className="bg-gray-900 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-2">Bu mesaja cevap yaz (gruba gonderilecek):</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Cevabinizi yazin..."
                          value={replyText[alert.id] || ""}
                          onChange={(e) => setReplyText((p) => ({ ...p, [alert.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && handleReply(alert)}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleReply(alert)}
                          disabled={sending[alert.id] || !replyText[alert.id]?.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Gonder
                        </button>
                      </div>
                      {replySuccess[alert.id] && (
                        <p className="text-xs text-green-400 mt-2">Cevap gonderildi!</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
