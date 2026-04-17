"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase";
import type { Alert } from "@/types";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeAlerts, setRealtimeAlerts] = useState<Alert[]>([]);

  const fetchGroupTitle = useCallback(async (groupId: number): Promise<string> => {
    try {
      const { data } = await supabase
        .from("groups")
        .select("title")
        .eq("id", groupId)
        .single();
      return data?.title ?? "?";
    } catch {
      return "?";
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Channel olustur, callback ekle, SONRA subscribe et
    const channel = supabase.channel("alerts-feed");

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "alerts" },
      async (payload) => {
        if (!mounted) return;
        const alert = payload.new as Record<string, unknown>;
        const groupTitle = await fetchGroupTitle(alert.group_id as number);

        const newAlert: Alert = {
          id: alert.id as number,
          group_id: alert.group_id as number,
          group_title: groupTitle,
          title: (alert.title as string) || "",
          description: (alert.description as string) || "",
          urgency: alert.urgency as number,
          is_read: alert.is_read as boolean,
          created_at: alert.created_at as string,
        };

        setRealtimeAlerts((prev) => [newAlert, ...prev].slice(0, 50));
      }
    );

    channel.subscribe((status) => {
      if (mounted) {
        setIsConnected(status === "SUBSCRIBED");
      }
    });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [fetchGroupTitle]);

  return { isConnected, realtimeAlerts };
}
