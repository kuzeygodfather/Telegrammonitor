"use client";

import { useEffect, useState, useRef } from "react";
import { Terminal, RefreshCw, Server, Cpu, HardDrive, MemoryStick, Activity, CheckCircle, XCircle, AlertTriangle, ChevronDown } from "lucide-react";
import { useToast } from "@/components/Toast";

interface LogEntry { text: string; level: string; }
interface SystemStatus {
  backend: string; setup: string; backend_restarts: number; backend_since: string;
  disk_used?: string; disk_total?: string; disk_percent?: string;
  mem_total?: string; mem_used?: string;
  session_count?: number; sessions?: string[];
}

type LogTab = "backend" | "analyzer";

export default function LogsPage() {
  const [tab, setTab] = useState<LogTab>("backend");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineCount, setLineCount] = useState(100);
  const logRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchLogs = async (t?: LogTab) => {
    const target = t || tab;
    try {
      const res = await fetch(`/api/logs/${target}?lines=${lineCount}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setLogs([{ text: "Log API'ye baglanilamadi", level: "error" }]);
    }
    setLoading(false);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/logs/status");
      const data = await res.json();
      setStatus(data);
    } catch {}
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLogs(), fetchStatus()]);
    toast("Loglar guncellendi");
    setRefreshing(false);
  };

  useEffect(() => {
    fetchLogs();
    fetchStatus();
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchLogs(tab);
  }, [tab, lineCount]);

  // Auto-refresh every 10s
  useEffect(() => {
    const i = setInterval(() => {
      fetchLogs();
      fetchStatus();
    }, 10000);
    return () => clearInterval(i);
  }, [tab, lineCount]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const levelColor: Record<string, string> = {
    error: "text-red-400",
    warning: "text-amber-400",
    success: "text-green-400",
    info: "text-gray-400",
  };

  const levelBg: Record<string, string> = {
    error: "bg-red-500/5 border-l-2 border-red-500/50",
    warning: "bg-amber-500/5 border-l-2 border-amber-500/50",
    success: "bg-green-500/5 border-l-2 border-green-500/30",
    info: "",
  };

  const statusIcon = (s: string) => {
    if (s === "active") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (s === "inactive" || s === "failed") return <XCircle className="w-4 h-4 text-red-400" />;
    return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Terminal className="w-6 h-6 text-emerald-400" />Sistem Loglari
        </h1>
        <div className="flex gap-1.5">
          <button onClick={refresh} disabled={refreshing} className="h-8 px-2.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />Yenile
          </button>
        </div>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Server className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Backend</span>
            </div>
            <div className="flex items-center gap-2">
              {statusIcon(status.backend)}
              <span className={`text-sm font-semibold ${status.backend === "active" ? "text-green-400" : "text-red-400"}`}>
                {status.backend === "active" ? "Aktif" : status.backend}
              </span>
            </div>
            {status.backend_restarts > 0 && (
              <p className="text-[10px] text-amber-400 mt-1">{status.backend_restarts} restart</p>
            )}
            {status.backend_since && (
              <p className="text-[10px] text-gray-600 mt-0.5">{status.backend_since.split(" ").slice(0, 3).join(" ")}</p>
            )}
          </div>

          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Setup API</span>
            </div>
            <div className="flex items-center gap-2">
              {statusIcon(status.setup)}
              <span className={`text-sm font-semibold ${status.setup === "active" ? "text-green-400" : "text-red-400"}`}>
                {status.setup === "active" ? "Aktif" : status.setup}
              </span>
            </div>
          </div>

          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <HardDrive className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Disk</span>
            </div>
            <p className="text-sm font-semibold">{status.disk_used || "?"} / {status.disk_total || "?"}</p>
            <p className={`text-[10px] mt-0.5 ${parseInt(status.disk_percent || "0") > 80 ? "text-red-400" : "text-gray-500"}`}>{status.disk_percent || "?"} kullaniliyor</p>
          </div>

          <div className="bg-[#0d0d18] rounded-xl border border-white/5 p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">Sessions</span>
            </div>
            <p className="text-sm font-semibold">{status.session_count || 0} kullanici</p>
            {status.sessions && status.sessions.length > 0 && (
              <p className="text-[10px] text-gray-600 mt-0.5 truncate">{status.sessions.join(", ")}</p>
            )}
          </div>
        </div>
      )}

      {/* Log Viewer */}
      <div className="bg-[#0d0d18] rounded-2xl border border-white/5 overflow-hidden">
        {/* Tabs + Controls */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <div className="flex gap-1">
            {([
              { k: "backend" as LogTab, l: "Backend", desc: "Telegram listener + sistem" },
              { k: "analyzer" as LogTab, l: "Analyzer", desc: "AI analiz loglari" },
            ]).map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${tab === t.k ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
                title={t.desc}>
                {t.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select value={lineCount} onChange={e => setLineCount(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-gray-400 focus:outline-none">
              <option value={50}>50 satir</option>
              <option value={100}>100 satir</option>
              <option value={200}>200 satir</option>
              <option value={500}>500 satir</option>
            </select>
            <button onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-1 rounded-lg text-[10px] border transition-all ${autoScroll ? "bg-emerald-600/20 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/10 text-gray-600"}`}>
              <ChevronDown className="w-3 h-3 inline mr-0.5" />{autoScroll ? "Auto" : "Manuel"}
            </button>
          </div>
        </div>

        {/* Log Content */}
        <div ref={logRef} className="h-[500px] overflow-y-auto p-4 font-mono text-[11px] leading-[1.8] space-y-0">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />Yukleniyor...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-600">Log yok</div>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className={`px-2 py-0.5 rounded ${levelBg[entry.level] || ""} ${levelColor[entry.level] || "text-gray-500"}`}>
                {entry.text}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600">
          <span>{logs.length} satir</span>
          <span>10 saniyede bir otomatik yenilenir</span>
        </div>
      </div>
    </div>
  );
}
