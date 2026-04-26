"use client";

import { useEffect, useState } from "react";
import { Layers, MessageSquare, Clock, Send, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { sendReply } from "@/lib/api";
import { formatDateIST } from "@/lib/utils";

interface Topic {
  id: number;
  group_id: number;
  group_title: string;
  title: string;
  status: string;
  durum: string;
  urgency: number;
  summary: string;
  first_message_at: string;
  last_message_at: string;
  message_count: number;
  last_aksiyon: string;
}

interface TopicMessage {
  id: number;
  sender_name: string;
  text: string;
  date: string;
  telegram_msg_id: number;
}

const DURUM_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  SORUN: { bg: "bg-red-900/40 border-red-700", text: "text-red-400", label: "SORUN" },
  ONAY_BEKLIYOR: { bg: "bg-yellow-900/40 border-yellow-700", text: "text-yellow-400", label: "ONAY BEKLIYOR" },
  AKSIYON_GEREKLI: { bg: "bg-orange-900/40 border-orange-700", text: "text-orange-400", label: "AKSIYON GEREKLI" },
  BILGI: { bg: "bg-blue-900/40 border-blue-700", text: "text-blue-400", label: "BILGI" },
  RUTIN: { bg: "bg-gray-800 border-gray-700", text: "text-gray-500", label: "RUTIN" },
};

const URGENCY_COLORS: Record<number, string> = {
  1: "bg-gray-600", 2: "bg-blue-600", 3: "bg-yellow-500", 4: "bg-orange-500", 5: "bg-red-500",
};

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [topicMessages, setTopicMessages] = useState<Record<number, TopicMessage[]>>({});
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replySuccess, setReplySuccess] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchTopics();
    const interval = setInterval(fetchTopics, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchTopics = async () => {
    let query = supabase
      .from("topics")
      .select("*, groups(title)")
      .order("last_message_at", { ascending: false })
      ;

    if (filter === "open") query = query.eq("status", "open");

    const { data } = await query;
    setTopics(
      (data ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        group_title: (t.groups as Record<string, string>)?.title ?? "?",
      })) as Topic[]
    );
    setLoading(false);
  };

  const loadMessages = async (topicId: number) => {
    if (topicMessages[topicId]) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_name, text, date, telegram_msg_id")
      .eq("topic_id", topicId)
      .order("date", { ascending: true });
    setTopicMessages((prev) => ({ ...prev, [topicId]: (data ?? []) as TopicMessage[] }));
  };

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      await loadMessages(id);
    }
  };

  const closeTopic = async (id: number) => {
    await supabase.from("topics").update({ status: "resolved" }).eq("id", id);
    setTopics((prev) => prev.map((t) => (t.id === id ? { ...t, status: "resolved" } : t)));
  };

  const handleReply = async (topic: Topic) => {
    const text = replyText[topic.id];
    if (!text?.trim()) return;
    const msgs = topicMessages[topic.id];
    const lastMsg = msgs?.[msgs.length - 1];
    await sendReply(topic.group_id, text.trim(), lastMsg?.telegram_msg_id || undefined);
    setReplyText((p) => ({ ...p, [topic.id]: "" }));
    setReplySuccess((p) => ({ ...p, [topic.id]: true }));
    setTimeout(() => setReplySuccess((p) => ({ ...p, [topic.id]: false })), 3000);
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
      <div className="flex items-center gap-3">
        <Layers className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-bold">Konular</h1>
        <span className="text-sm text-gray-500">({topics.length})</span>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter("open")} className={`px-4 py-2 rounded-lg text-sm ${filter === "open" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
          Acik Konular
        </button>
        <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-lg text-sm ${filter === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
          Tumu
        </button>
      </div>

      <div className="space-y-3">
        {topics.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700">
            <Layers className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500">Henuz konu yok - mesajlar geldikce konular olusacak</p>
          </div>
        ) : (
          topics.map((topic) => {
            const style = DURUM_STYLES[topic.durum] || DURUM_STYLES.BILGI;
            const isExpanded = expandedId === topic.id;
            const msgs = topicMessages[topic.id] || [];

            return (
              <div key={topic.id} className={`rounded-xl border ${style.bg} transition-all`}>
                {/* Konu Header */}
                <div className="p-4 cursor-pointer" onClick={() => toggleExpand(topic.id)}>
                  <div className="flex items-start gap-3">
                    <div className={`px-2 py-1 rounded text-xs font-bold text-white ${URGENCY_COLORS[topic.urgency]}`}>
                      {topic.urgency}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-xs mb-1">
                        <span className={`px-2 py-0.5 rounded font-semibold ${style.text} bg-black/20`}>
                          {style.label}
                        </span>
                        <span className="bg-gray-700/50 px-2 py-0.5 rounded">{topic.group_title}</span>
                        <span className="flex items-center gap-1 text-gray-500">
                          <MessageSquare className="w-3 h-3" />
                          {topic.message_count} mesaj
                        </span>
                        <span className="flex items-center gap-1 text-gray-600 ml-auto">
                          <Clock className="w-3 h-3" />
                          {formatDateIST(topic.last_message_at)}
                        </span>
                        {topic.status === "resolved" && (
                          <span className="bg-green-900 text-green-400 px-2 py-0.5 rounded text-xs">COZULDU</span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm mt-1">{topic.title}</h3>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{topic.summary}</p>
                      {topic.last_aksiyon && (
                        <p className="text-xs text-orange-400 mt-1">Aksiyon: {topic.last_aksiyon}</p>
                      )}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                  </div>
                </div>

                {/* Detay - acilinca */}
                {isExpanded && (
                  <div className="border-t border-gray-700/50 p-4 space-y-3">
                    {/* Mesaj timeline */}
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {msgs.length === 0 ? (
                        <p className="text-xs text-gray-500">Mesajlar yukleniyor...</p>
                      ) : (
                        msgs.map((m, idx) => (
                          <div key={m.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                              {idx < msgs.length - 1 && <div className="w-0.5 flex-1 bg-gray-700" />}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="font-medium text-gray-300">{m.sender_name}</span>
                                <span>{formatDateIST(m.date)}</span>
                              </div>
                              <p className="text-sm mt-0.5">{m.text}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Aksiyonlar */}
                    <div className="flex gap-2 pt-2 border-t border-gray-700/50">
                      {topic.status === "open" && (
                        <button
                          onClick={() => closeTopic(topic.id)}
                          className="text-xs bg-green-900 text-green-400 hover:bg-green-800 px-3 py-1.5 rounded-lg"
                        >
                          Konuyu Kapat
                        </button>
                      )}
                    </div>

                    {/* Cevap */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Bu konuya cevap yaz (gruba gonderilecek)..."
                        value={replyText[topic.id] || ""}
                        onChange={(e) => setReplyText((p) => ({ ...p, [topic.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleReply(topic)}
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleReply(topic)}
                        disabled={!replyText[topic.id]?.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg text-sm flex items-center gap-1"
                      >
                        <Send className="w-4 h-4" /> Gonder
                      </button>
                    </div>
                    {replySuccess[topic.id] && <p className="text-xs text-green-400">Cevap gonderildi!</p>}
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
