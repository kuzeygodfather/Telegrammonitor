import { supabase } from "./supabase";
import type { DashboardStats, Alert, Message, Group, Keyword, PaginatedResponse } from "@/types";

// ========== Dashboard ==========

export async function getStats(): Promise<DashboardStats> {
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [msgRes, alertRes, unreadRes, groupRes, hourRes] = await Promise.all([
    supabase.from("messages").select("*", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("alerts").select("*", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("is_read", false),
    supabase.from("groups").select("*", { count: "exact", head: true }).eq("is_monitored", true),
    supabase.rpc("get_messages_by_hour"),
  ]);

  return {
    total_messages_today: msgRes.count ?? 0,
    total_alerts: alertRes.count ?? 0,
    unread_alerts: unreadRes.count ?? 0,
    active_groups: groupRes.count ?? 0,
    messages_by_hour: hourRes.data ?? [],
  };
}

export async function getRecentAlerts(limit = 10): Promise<Alert[]> {
  const { data } = await supabase
    .from("alerts")
    .select("*, groups(title)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    group_title: (row.groups as Record<string, string>)?.title ?? "?",
  })) as Alert[];
}

export async function getRecentMessages(limit = 20): Promise<Message[]> {
  const { data } = await supabase
    .from("messages")
    .select("*, groups(title), analyses(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const analyses = row.analyses as Record<string, unknown>[] | null;
    return {
      ...row,
      group_title: (row.groups as Record<string, string>)?.title ?? "?",
      analysis: analyses && analyses.length > 0 ? analyses[0] : null,
    };
  }) as Message[];
}

// ========== Messages ==========

export async function getMessages(params?: {
  group_id?: number;
  keyword?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<Message>> {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("messages")
    .select("*, groups(title), analyses(*)", { count: "exact" });

  if (params?.group_id) query = query.eq("group_id", params.group_id);
  if (params?.keyword) query = query.ilike("text", `%${params.keyword}%`);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const analyses = row.analyses as Record<string, unknown>[] | null;
    return {
      ...row,
      group_title: (row.groups as Record<string, string>)?.title ?? "?",
      analysis: analyses && analyses.length > 0 ? analyses[0] : null,
    };
  }) as Message[];

  return { total: count ?? 0, page, limit, items };
}

// ========== Alerts ==========

export async function getAlerts(params?: {
  is_read?: boolean;
  urgency_min?: number;
  page?: number;
}): Promise<PaginatedResponse<Alert>> {
  const page = params?.page ?? 1;
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("alerts")
    .select("*, groups(title)", { count: "exact" });

  if (params?.is_read !== undefined) query = query.eq("is_read", params.is_read);
  if (params?.urgency_min) query = query.gte("urgency", params.urgency_min);

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const items = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    group_title: (row.groups as Record<string, string>)?.title ?? "?",
  })) as Alert[];

  return { total: count ?? 0, page, limit, items };
}

export async function markAlertRead(id: number) {
  return supabase.from("alerts").update({ is_read: true }).eq("id", id);
}

export async function markAllAlertsRead() {
  return supabase.from("alerts").update({ is_read: true }).eq("is_read", false);
}

// ========== Groups ==========

export async function getGroups(): Promise<Group[]> {
  const { data } = await supabase.rpc("get_group_stats");
  return (data ?? []) as Group[];
}

export async function toggleGroupMonitoring(id: number): Promise<Group> {
  const { data: rows } = await supabase
    .from("groups")
    .select("is_monitored")
    .eq("id", id);

  const current = rows?.[0];
  if (!current) throw new Error("Grup bulunamadi");

  const { data } = await supabase
    .from("groups")
    .update({ is_monitored: !current.is_monitored })
    .eq("id", id)
    .select();

  return (data?.[0] ?? current) as Group;
}

// ========== Keywords ==========

export async function getKeywords(): Promise<Keyword[]> {
  const { data } = await supabase
    .from("keywords")
    .select("*")
    .order("category")
    .order("keyword");
  return (data ?? []) as Keyword[];
}

export async function createKeyword(keyword: string, category = "custom") {
  return supabase.from("keywords").insert({ keyword: keyword.toLowerCase(), category });
}

export async function deleteKeyword(id: number) {
  return supabase.from("keywords").delete().eq("id", id);
}

export async function toggleKeyword(id: number) {
  const { data: rows } = await supabase
    .from("keywords")
    .select("is_active")
    .eq("id", id);

  const current = rows?.[0];
  if (!current) return;

  return supabase
    .from("keywords")
    .update({ is_active: !current.is_active })
    .eq("id", id);
}
