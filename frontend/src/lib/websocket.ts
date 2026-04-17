"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Alert } from "@/types";

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeAlerts, setRealtimeAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel("alerts-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        async (payload) => {
          const alert = payload.new as Record<string, unknown>;
          // Grup basligi al
          const { data: group } = await supabase
            .from("groups")
            .select("title")
            .eq("id", alert.group_id)
            .single();

          const newAlert: Alert = {
            id: alert.id as number,
            group_id: alert.group_id as number,
            group_title: group?.title ?? "?",
            title: alert.title as string,
            description: alert.description as string,
            urgency: alert.urgency as number,
            is_read: alert.is_read as boolean,
            created_at: alert.created_at as string,
          };

          setRealtimeAlerts((prev) => [newAlert, ...prev].slice(0, 50));
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { isConnected, realtimeAlerts };
}
