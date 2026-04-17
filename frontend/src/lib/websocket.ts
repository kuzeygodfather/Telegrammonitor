"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Alert } from "@/types";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeAlerts, setRealtimeAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let mounted = true;

    const fetchAlerts = async () => {
      try {
        const { data } = await supabase
          .from("alerts")
          .select("*, groups(title)")
          .order("created_at", { ascending: false })
          .limit(20);

        if (!mounted || !data) return;

        const alerts: Alert[] = data.map((row: Record<string, unknown>) => ({
          id: row.id as number,
          group_id: row.group_id as number,
          group_title: (row.groups as Record<string, string>)?.title ?? "?",
          title: (row.title as string) || "",
          description: (row.description as string) || "",
          urgency: row.urgency as number,
          is_read: row.is_read as boolean,
          created_at: row.created_at as string,
        }));

        setRealtimeAlerts(alerts);
        setIsConnected(true);
      } catch {
        if (mounted) setIsConnected(false);
      }
    };

    // Ilk cagri
    fetchAlerts();

    // Her 10 saniyede bir kontrol et
    const interval = setInterval(fetchAlerts, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { isConnected, realtimeAlerts };
}
