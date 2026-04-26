"use client";

import { useEffect, useState, useRef } from "react";
// URL params parsed manually for static export
import { MessageSquare, Send, Users, Search, ArrowLeft, RefreshCw } from "lucide-react";
import { supabase, getUserId } from "@/lib/supabase";
import { sendReply } from "@/lib/api";
import { formatDateIST } from "@/lib/utils";

interface ChatGroup { id: number; title: string; is_monitored: boolean; last_msg?: string; last_date?: string; unread?: number; }
interface Msg { id: number; sender_name: string; text: string; date: string; telegram_msg_id: number; }

function getBrand(t: string): string {
  const l = t.toLowerCase().replace(/İ/g, "i");
  if (/bia|biabet|livebia/.test(l)) return "BIA";
  if (/benja|benjabet|livebenja|bnj/.test(l)) return "Benjabet";
  if (/dil|dilbet|dilrulet/.test(l)) return "Dilbet";
  if (/dopamin/.test(l)) return "Dopamin";
  return "";
}

export default function ChatPage() {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selected, setSelected] = useState<ChatGroup | null>(null);
  const [highlightMsg, setHighlightMsg] = useState<number | null>(null);
  const [deepLinkGroup, setDeepLinkGroup] = useState<number | null>(null);
  const [deepLinkMsg, setDeepLinkMsg] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGroups();
    const i = setInterval(loadGroups, 30000);
    return () => clearInterval(i);
  }, []);

  // Secili gruptaki mesajlari canli guncelle
  useEffect(() => {
    if (!selected) return;
    const i = setInterval(() => loadMessages(selected.id, true), 5000);
    return () => clearInterval(i);
  }, [selected]);

  const loadGroups = async () => {
    const uid = getUserId();
    if (!uid) return;
    const { data } = await supabase.from("groups").select("id,title,is_monitored").eq("user_id", uid).order("title");
    setGroups((data || []).map((g: Record<string, unknown>) => ({
      id: g.id as number, title: g.title as string, is_monitored: g.is_monitored as boolean,
    })));
    setLoading(false);
  };

  const loadMessages = async (groupId: number, silent = false) => {
    if (!silent) setMsgLoading(true);
    const uid = getUserId();
    const { data } = await supabase.from("messages").select("id,sender_name,text,date,telegram_msg_id")
      .eq("group_id", groupId).eq("user_id", uid).order("date", { ascending: false }).limit(500);
    setMessages(((data || []) as Msg[]).reverse());
    if (!silent) { setMsgLoading(false); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100); }
  };

  const selectGroup = async (g: ChatGroup) => {
    setSelected(g);
    await loadMessages(g.id);
  };

  const handleSend = async () => {
    if (!text.trim() || !selected || sending) return;
    setSending(true);
    const lastMsg = messages[messages.length - 1];
    await sendReply(selected.id, text.trim(), lastMsg?.telegram_msg_id || undefined);
    setText("");
    setSending(false);
    setTimeout(() => loadMessages(selected.id, true), 1000);
  };

  const filtered = groups.filter(g => g.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-[1200px] mx-auto h-[calc(100vh-100px)] flex flex-col">
      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 mb-4">
        <MessageSquare className="w-6 h-6 text-blue-400" />Telegram
      </h1>

      <div className="flex-1 flex bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden min-h-0">
        {/* Sol - Grup Listesi */}
        <div className={`${selected ? "hidden sm:flex" : "flex"} flex-col w-full sm:w-80 border-r border-white/5`}>
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600" />
              <input type="text" placeholder="Grup ara..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-4 text-center text-gray-600 text-xs">Yukleniyor...</div> :
              filtered.map(g => (
                <div key={g.id} onClick={() => selectGroup(g)}
                  className={`p-3 border-b border-white/5 cursor-pointer transition-all ${selected?.id === g.id ? "bg-blue-600/10" : "hover:bg-white/[0.03]"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {getBrand(g.title) && <span className="text-[8px] text-gray-500 font-semibold">{getBrand(g.title)}</span>}
                        <h3 className="text-xs font-medium truncate">{g.title}</h3>
                      </div>
                      {g.last_date && <p className="text-[10px] text-gray-600 mt-0.5">{formatDateIST(g.last_date)}</p>}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Sag - Mesajlar */}
        <div className={`${!selected ? "hidden sm:flex" : "flex"} flex-col flex-1`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-700 text-sm">Bir grup secin</div>
          ) : (
            <>
              {/* Header */}
              <div className="p-3 border-b border-white/5 flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="sm:hidden p-1"><ArrowLeft className="w-4 h-4" /></button>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">{selected.title}</h3>
                  <p className="text-[10px] text-gray-500">{messages.length} mesaj</p>
                </div>
                <button onClick={() => loadMessages(selected.id)} className="p-1.5 bg-white/5 rounded-lg hover:bg-white/10"><RefreshCw className="w-3.5 h-3.5 text-gray-400" /></button>
              </div>

              {/* Mesajlar */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {msgLoading ? <div className="text-center text-gray-600 text-xs py-8">Yukleniyor...</div> :
                  messages.map(m => (
                    <div key={m.id} id={`msg-${m.telegram_msg_id}`} className="flex gap-2 rounded-lg p-1 -m-1 transition-all">
                      <div className="w-7 h-7 bg-blue-600/10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-blue-400">{m.sender_name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="font-semibold text-blue-400">{m.sender_name}</span>
                          <span className="text-gray-700">{formatDateIST(m.date)}</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5 leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                      </div>
                    </div>
                  ))
                }
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-white/5">
                <div className="flex gap-2">
                  <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()}
                    placeholder="Mesaj yaz..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:border-blue-500/50 placeholder-gray-600" />
                  <button onClick={handleSend} disabled={!text.trim() || sending}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
