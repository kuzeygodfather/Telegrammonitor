import { supabase, getUserId } from "./supabase";
import type { DashboardStats, Alert, Message, Group, Keyword, PaginatedResponse } from "@/types";

// ========== Dashboard ==========

export async function getStats(sinceDate?: string, untilDate?: string): Promise<DashboardStats> {
  const uid = getUserId();
  const now = new Date();
  const since = sinceDate || (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
  const until = untilDate || now.toISOString();

  let msgQ = supabase.from("messages").select("*", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
  let alertQ = supabase.from("alerts").select("*", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since);
  if (untilDate) {
    msgQ = msgQ.lte("created_at", until);
    alertQ = alertQ.lte("created_at", until);
  }

  const [msgRes, alertRes, unreadRes, groupRes] = await Promise.all([
    msgQ, alertQ,
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("is_read", false),
    supabase.from("groups").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("is_monitored", true),
  ]);

  // Saatlik dagilimi backend API'den al
  let messages_by_hour: { hour: number; count: number }[] = [];
  try {
    const hourRes = await fetch(`/api/stats/hourly?user_id=${uid}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`);
    const hourData = await hourRes.json();
    messages_by_hour = hourData.hours || [];
  } catch {
    // Fallback: bos grafik
    messages_by_hour = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  }

  return {
    total_messages_today: msgRes.count ?? 0,
    total_alerts: alertRes.count ?? 0,
    unread_alerts: unreadRes.count ?? 0,
    active_groups: groupRes.count ?? 0,
    messages_by_hour,
  };
}

export async function getRecentAlerts(limit = 10): Promise<Alert[]> {
  const uid = getUserId();
  const { data } = await supabase.from("alerts").select("*, groups(title)").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r: Record<string, unknown>) => ({ ...r, group_title: (r.groups as Record<string, string>)?.title ?? "?" })) as Alert[];
}

export async function getRecentMessages(limit = 20): Promise<Message[]> {
  const uid = getUserId();
  const { data } = await supabase.from("messages").select("*, groups(title), analyses(*)").eq("user_id", uid).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r: Record<string, unknown>) => {
    const analyses = r.analyses as Record<string, unknown>[] | null;
    return { ...r, group_title: (r.groups as Record<string, string>)?.title ?? "?", analysis: analyses && analyses.length > 0 ? analyses[0] : null };
  }) as Message[];
}

// ========== Messages ==========

export async function getMessages(params?: { group_id?: number; keyword?: string; page?: number; limit?: number }): Promise<PaginatedResponse<Message>> {
  const uid = getUserId();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("messages").select("*, groups(title), analyses(*)", { count: "exact" }).eq("user_id", uid);
  if (params?.group_id) query = query.eq("group_id", params.group_id);
  if (params?.keyword) query = query.ilike("text", `%${params.keyword}%`);

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const items = (data ?? []).map((r: Record<string, unknown>) => {
    const analyses = r.analyses as Record<string, unknown>[] | null;
    return { ...r, group_title: (r.groups as Record<string, string>)?.title ?? "?", analysis: analyses && analyses.length > 0 ? analyses[0] : null };
  }) as Message[];
  return { total: count ?? 0, page, limit, items };
}

// ========== Alerts ==========

export async function getAlerts(params?: { is_read?: boolean; urgency_min?: number; page?: number }): Promise<PaginatedResponse<Alert>> {
  const uid = getUserId();
  const page = params?.page ?? 1;
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from("alerts").select("*, groups(title)", { count: "exact" }).eq("user_id", uid);
  if (params?.is_read !== undefined) query = query.eq("is_read", params.is_read);
  if (params?.urgency_min) query = query.gte("urgency", params.urgency_min);

  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  const items = (data ?? []).map((r: Record<string, unknown>) => ({ ...r, group_title: (r.groups as Record<string, string>)?.title ?? "?" })) as Alert[];
  return { total: count ?? 0, page, limit, items };
}

export async function markAlertRead(id: number) {
  return supabase.from("alerts").update({ is_read: true }).eq("id", id);
}

export async function markAllAlertsRead() {
  const uid = getUserId();
  return supabase.from("alerts").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
}

// ========== Replies ==========

export async function sendReply(groupId: number, text: string, replyToMsgId?: number) {
  const uid = getUserId();
  return supabase.from("replies").insert({ group_id: groupId, reply_to_msg_id: replyToMsgId || null, text, user_id: uid });
}

// ========== Groups ==========

export async function getGroups(): Promise<Group[]> {
  const uid = getUserId();
  // rpc kullanmak yerine direkt sorgu - user_id filtreli
  const { data } = await supabase.from("groups").select("*").eq("user_id", uid).order("title");
  return (data ?? []).map((g: Record<string, unknown>) => ({ ...g, message_count: 0, last_activity: null })) as Group[];
}

export async function toggleGroupMonitoring(id: number): Promise<Group> {
  const { data: rows } = await supabase.from("groups").select("is_monitored").eq("id", id);
  const current = rows?.[0];
  if (!current) throw new Error("Grup bulunamadi");
  const { data } = await supabase.from("groups").update({ is_monitored: !current.is_monitored }).eq("id", id).select();
  return (data?.[0] ?? current) as Group;
}

// ========== Keywords ==========

export async function getKeywords(): Promise<Keyword[]> {
  const uid = getUserId();
  const { data } = await supabase.from("keywords").select("*").eq("user_id", uid).order("category").order("keyword");
  return (data ?? []) as Keyword[];
}

export async function createKeyword(keyword: string, category = "custom") {
  const uid = getUserId();
  return supabase.from("keywords").insert({ keyword: keyword.toLowerCase(), category, user_id: uid });
}

export async function deleteKeyword(id: number) {
  return supabase.from("keywords").delete().eq("id", id);
}

export async function toggleKeyword(id: number) {
  const { data: rows } = await supabase.from("keywords").select("is_active").eq("id", id);
  const current = rows?.[0];
  if (!current) return;
  return supabase.from("keywords").update({ is_active: !current.is_active }).eq("id", id);
}



// ========== Group Senders (for staff selection) ==========

export interface GroupSender {
  sender_name: string;
  sender_id: number | null;
  message_count: number;
  group_titles: string[];
}

export async function getGroupSenders(): Promise<GroupSender[]> {
  const uid = getUserId();
  // Get monitored groups
  const { data: groups } = await supabase
    .from("groups")
    .select("id, title")
    .eq("user_id", uid)
    .eq("is_monitored", true);

  if (!groups || groups.length === 0) return [];

  const groupIds = groups.map((g: Record<string, unknown>) => g.id as number);
  const groupMap: Record<number, string> = {};
  groups.forEach((g: Record<string, unknown>) => { groupMap[g.id as number] = g.title as string; });

  // Paginate through ALL messages to get unique senders
  const senderMap: Record<string, { sender_id: number | null; count: number; groups: Set<string> }> = {};
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: messages } = await supabase
      .from("messages")
      .select("sender_name, sender_id, group_id")
      .eq("user_id", uid)
      .in("group_id", groupIds)
      .not("sender_name", "is", null)
      .range(offset, offset + pageSize - 1);

    if (!messages || messages.length === 0) {
      hasMore = false;
      break;
    }

    for (const msg of messages) {
      const name = (msg as Record<string, unknown>).sender_name as string;
      if (!name || name.trim() === "") continue;
      if (!senderMap[name]) {
        senderMap[name] = { sender_id: (msg as Record<string, unknown>).sender_id as number | null, count: 0, groups: new Set() };
      }
      senderMap[name].count++;
      const gid = (msg as Record<string, unknown>).group_id as number;
      if (groupMap[gid]) senderMap[name].groups.add(groupMap[gid]);
    }

    offset += pageSize;
    if (messages.length < pageSize) hasMore = false;
  }

  return Object.entries(senderMap)
    .map(([name, info]) => ({
      sender_name: name,
      sender_id: info.sender_id,
      message_count: info.count,
      group_titles: Array.from(info.groups),
    }))
    .sort((a, b) => b.message_count - a.message_count);
}

// ========== Staff ==========

export interface Staff {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Shift {
  id: number;
  staff_id: number;
  day_of_week: number;
  shift_start: string | null;
  shift_end: string | null;
  is_off: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffWithShifts {
  staff: Staff;
  shifts: Record<number, Shift>;
}

export async function getStaffList(): Promise<Staff[]> {
  const uid = getUserId();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("user_id", uid)
    .order("name");
  return (data ?? []) as Staff[];
}

export async function createStaff(name: string): Promise<Staff> {
  const uid = getUserId();
  const { data, error } = await supabase
    .from("staff")
    .insert({ name, user_id: uid })
    .select()
    .single();
  if (error) throw error;
  return data as Staff;
}

export async function updateStaff(id: number, name: string) {
  return supabase.from("staff").update({ name }).eq("id", id);
}

export async function deleteStaff(id: number) {
  return supabase.from("staff").delete().eq("id", id);
}

export async function toggleStaffActive(id: number) {
  const { data: rows } = await supabase.from("staff").select("is_active").eq("id", id);
  const current = rows?.[0];
  if (!current) return;
  return supabase.from("staff").update({ is_active: !current.is_active }).eq("id", id);
}

// ========== Shifts ==========

export async function getShifts(): Promise<Shift[]> {
  const uid = getUserId();
  const { data } = await supabase
    .from("shifts")
    .select("*, staff!inner(user_id)")
    .eq("staff.user_id", uid)
    .is("period_id", null)
    .order("staff_id")
    .order("day_of_week");
  return (data ?? []) as Shift[];
}

export async function getStaffWithShifts(): Promise<StaffWithShifts[]> {
  const [staffList, shiftList] = await Promise.all([getStaffList(), getShifts()]);
  return staffList.map((staff) => {
    const staffShifts = shiftList.filter((s) => s.staff_id === staff.id);
    const shiftMap: Record<number, Shift> = {};
    staffShifts.forEach((s) => { shiftMap[s.day_of_week] = s; });
    return { staff, shifts: shiftMap };
  });
}

export async function upsertShift(staffId: number, dayOfWeek: number, shiftStart: string | null, shiftEnd: string | null, isOff: boolean) {
  const { data: existing } = await supabase
    .from("shifts")
    .select("id")
    .eq("staff_id", staffId)
    .eq("day_of_week", dayOfWeek);

  if (existing && existing.length > 0) {
    return supabase.from("shifts").update({
      shift_start: isOff ? null : shiftStart,
      shift_end: isOff ? null : shiftEnd,
      is_off: isOff,
      updated_at: new Date().toISOString(),
    }).eq("id", existing[0].id);
  } else {
    return supabase.from("shifts").insert({
      staff_id: staffId,
      day_of_week: dayOfWeek,
      shift_start: isOff ? null : shiftStart,
      shift_end: isOff ? null : shiftEnd,
      is_off: isOff,
    });
  }
}

export async function bulkUpsertShifts(shifts: { staff_name: string; day_of_week: number; shift_start: string | null; shift_end: string | null; is_off: boolean }[]) {
  const staffNames = [...new Set(shifts.map((s) => s.staff_name))];
  const existingStaff = await getStaffList();
  const staffMap: Record<string, number> = {};

  for (const name of staffNames) {
    const found = existingStaff.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) {
      staffMap[name] = found.id;
    } else {
      const newStaff = await createStaff(name);
      staffMap[name] = newStaff.id;
    }
  }

  for (const shift of shifts) {
    const staffId = staffMap[shift.staff_name];
    if (staffId) {
      await upsertShift(staffId, shift.day_of_week, shift.shift_start, shift.shift_end, shift.is_off);
    }
  }
}

export function getCurrentShiftStaff(staffWithShifts: StaffWithShifts[]): { onDuty: StaffWithShifts[]; offDuty: StaffWithShifts[] } {
  // Get Turkey time (UTC+3) - getTime() is always UTC
  const now = new Date();
  const turkeyMs = now.getTime() + 3 * 3600000;
  const turkeyTime = new Date(turkeyMs);

  // 0=Monday ... 6=Sunday
  const jsDay = turkeyTime.getUTCDay(); // 0=Sunday
  const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const currentHour = turkeyTime.getUTCHours();
  const currentMinute = turkeyTime.getUTCMinutes();
  const currentTime = currentHour * 60 + currentMinute;

  const onDuty: StaffWithShifts[] = [];
  const offDuty: StaffWithShifts[] = [];

  for (const sw of staffWithShifts) {
    if (!sw.staff.is_active) continue;
    const shift = sw.shifts[dayOfWeek];

    // No shift assigned at all -> skip (don't show in either list)
    if (!shift) continue;

    // Izin day
    if (shift.is_off) {
      offDuty.push(sw);
      continue;
    }

    if (shift.shift_start && shift.shift_end) {
      const [sh, sm] = shift.shift_start.split(":").map(Number);
      const [eh, em] = shift.shift_end.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;

      let isWorking = false;
      if (end <= start) {
        // Night shift (e.g. 16:00-00:00 or 20:00-04:00)
        isWorking = currentTime >= start || currentTime < end;
      } else {
        isWorking = currentTime >= start && currentTime < end;
      }

      if (isWorking) {
        onDuty.push(sw);
      } else {
        offDuty.push(sw);
      }
    } else {
      offDuty.push(sw);
    }
  }
  return { onDuty, offDuty };
}




// ========== Shift Image Parser ==========

export async function parseShiftImage(file: File): Promise<{ staff_name: string; day_of_week: number; shift_start: string | null; shift_end: string | null; is_off: boolean }[]> {
  // Convert image to base64
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const mimeType = file.type || "image/jpeg";

  // Send to backend for AI parsing
  const response = await fetch("/api/parse-shift-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mime_type: mimeType }),
  });

  if (!response.ok) {
    throw new Error("Resim analiz edilemedi");
  }

  const result = await response.json();
  return result.shifts || [];
}


// ========== Shift Periods ==========

export interface ShiftPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  user_id: number;
  department: string;
  created_at: string;
}

export const DEPARTMENT_OPTIONS: Record<string, string> = {
  all: "Tumu",
  agent: "Canli Destek",
  finans: "Finans",
  marketing: "Marketing",
  it: "IT Ekibi",
  admin: "Yonetim",
};

export const STAFF_ROLES: Record<string, string> = {
  agent: "Canli Destek Agent",
  admin: "Canli Destek Admin",
  finans: "Finans",
  marketing: "Marketing",
  it: "IT Ekibi",
};

export async function getShiftPeriods(): Promise<ShiftPeriod[]> {
  const uid = getUserId();
  const { data } = await supabase
    .from("shift_periods")
    .select("*")
    .eq("user_id", uid)
    .order("start_date", { ascending: false });
  return (data ?? []) as ShiftPeriod[];
}

export async function createShiftPeriod(name: string, startDate: string, endDate: string, department: string = "all"): Promise<ShiftPeriod> {
  const uid = getUserId();
  const { data, error } = await supabase
    .from("shift_periods")
    .insert({ name, start_date: startDate, end_date: endDate, user_id: uid, department })
    .select()
    .single();
  if (error) throw error;
  return data as ShiftPeriod;
}

export async function deleteShiftPeriod(id: number) {
  return supabase.from("shift_periods").delete().eq("id", id);
}

export async function getShiftsByPeriod(periodId: number): Promise<Shift[]> {
  const { data } = await supabase
    .from("shifts")
    .select("*")
    .eq("period_id", periodId)
    .order("staff_id")
    .order("day_of_week");
  return (data ?? []) as Shift[];
}

export async function getStaffWithShiftsByPeriod(periodId: number | null, department?: string): Promise<StaffWithShifts[]> {
  let staffList = await getStaffList();
  if (department && department !== "all") {
    staffList = staffList.filter((s) => (s as Staff & { role?: string }).role === department);
  }
  let shiftList: Shift[];
  if (periodId) {
    shiftList = await getShiftsByPeriod(periodId);
  } else {
    shiftList = await getShifts();
  }
  return staffList.map((staff) => {
    const staffShifts = shiftList.filter((s) => s.staff_id === staff.id);
    const shiftMap: Record<number, Shift> = {};
    staffShifts.forEach((s) => { shiftMap[s.day_of_week] = s; });
    return { staff, shifts: shiftMap };
  });
}

export async function upsertShiftWithPeriod(staffId: number, dayOfWeek: number, shiftStart: string | null, shiftEnd: string | null, isOff: boolean, periodId: number) {
  const { data: existing } = await supabase
    .from("shifts")
    .select("id")
    .eq("staff_id", staffId)
    .eq("day_of_week", dayOfWeek)
    .eq("period_id", periodId);

  if (existing && existing.length > 0) {
    return supabase.from("shifts").update({
      shift_start: isOff ? null : shiftStart,
      shift_end: isOff ? null : shiftEnd,
      is_off: isOff,
      updated_at: new Date().toISOString(),
    }).eq("id", existing[0].id);
  } else {
    return supabase.from("shifts").insert({
      staff_id: staffId,
      day_of_week: dayOfWeek,
      shift_start: isOff ? null : shiftStart,
      shift_end: isOff ? null : shiftEnd,
      is_off: isOff,
      period_id: periodId,
    });
  }
}

export async function updateStaffRole(id: number, role: string) {
  return supabase.from("staff").update({ role }).eq("id", id);
}

export async function bulkUpsertShiftsWithPeriod(
  shifts: { staff_name: string; day_of_week: number; shift_start: string | null; shift_end: string | null; is_off: boolean }[],
  periodId: number
) {
  const staffNames = [...new Set(shifts.map((s) => s.staff_name))];
  const existingStaff = await getStaffList();
  const staffMap: Record<string, number> = {};
  for (const name of staffNames) {
    const found = existingStaff.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) { staffMap[name] = found.id; }
    else { const ns = await createStaff(name); staffMap[name] = ns.id; }
  }
  for (const shift of shifts) {
    const staffId = staffMap[shift.staff_name];
    if (staffId) await upsertShiftWithPeriod(staffId, shift.day_of_week, shift.shift_start, shift.shift_end, shift.is_off, periodId);
  }
}

// ========== Auto Shift Generator ==========

const ROLE_SHIFT_PATTERNS: Record<string, { shifts: string[][]; offDays: number }> = {
  agent: {
    shifts: [["08:00","16:00"],["16:00","00:00"],["00:00","08:00"]],
    offDays: 2,
  },
  admin: {
    shifts: [["08:00","16:00"],["12:00","20:00"]],
    offDays: 2,
  },
  finans: {
    shifts: [["09:00","18:00"]],
    offDays: 2,
  },
  marketing: {
    shifts: [["09:00","18:00"]],
    offDays: 2,
  },
  it: {
    shifts: [["08:00","16:00"],["16:00","00:00"]],
    offDays: 1,
  },
};

export function generateRotatingShifts(
  staffList: Staff[],
  weeksCount: number
): { weekIndex: number; staffId: number; staffName: string; role: string; day: number; start: string | null; end: string | null; isOff: boolean }[] {
  const result: { weekIndex: number; staffId: number; staffName: string; role: string; day: number; start: string | null; end: string | null; isOff: boolean }[] = [];

  // Group staff by role
  const byRole: Record<string, Staff[]> = {};
  for (const s of staffList) {
    const role = (s as Staff & { role?: string }).role || "agent";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(s);
  }

  for (const [role, members] of Object.entries(byRole)) {
    const pattern = ROLE_SHIFT_PATTERNS[role] || ROLE_SHIFT_PATTERNS.agent;
    const shiftOptions = pattern.shifts;
    const offDays = pattern.offDays;

    for (let week = 0; week < weeksCount; week++) {
      for (let mIdx = 0; mIdx < members.length; mIdx++) {
        const member = members[mIdx];
        // Rotate shift type each week
        const shiftIdx = (mIdx + week) % shiftOptions.length;
        const [start, end] = shiftOptions[shiftIdx];

        // Calculate off days - rotate which days are off
        const offStart = ((mIdx * 2) + week) % 7;

        for (let day = 0; day < 7; day++) {
          const isOff = day === offStart || day === (offStart + 1) % 7;
          if (isOff && offDays >= 2) {
            result.push({ weekIndex: week, staffId: member.id, staffName: member.name, role, day, start: null, end: null, isOff: true });
          } else if (isOff && offDays >= 1 && day === offStart) {
            result.push({ weekIndex: week, staffId: member.id, staffName: member.name, role, day, start: null, end: null, isOff: true });
          } else {
            result.push({ weekIndex: week, staffId: member.id, staffName: member.name, role, day, start, end, isOff: false });
          }
        }
      }
    }
  }
  return result;
}


// Get today's effective shifts - checks periods first, falls back to default
export async function getTodayStaffWithShifts(): Promise<StaffWithShifts[]> {
  const uid = getUserId();
  const staffList = await getStaffList();

  // Get today's date in Turkey timezone (UTC+3) - getTime() is always UTC
  const now = new Date();
  const turkeyMs = now.getTime() + 3 * 3600000;
  const turkeyDate = new Date(turkeyMs);
  const today = `${turkeyDate.getFullYear()}-${String(turkeyDate.getMonth() + 1).padStart(2, "0")}-${String(turkeyDate.getDate()).padStart(2, "0")}`;

  // Get all periods covering today
  const { data: activePeriods } = await supabase
    .from("shift_periods")
    .select("id")
    .eq("user_id", uid)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("created_at", { ascending: false });

  let shiftList: Shift[] = [];

  if (activePeriods && activePeriods.length > 0) {
    // Try each period until we find one with shifts
    for (const period of activePeriods) {
      const periodShifts = await getShiftsByPeriod((period as Record<string, unknown>).id as number);
      if (periodShifts.length > 0) {
        shiftList = periodShifts;
        break;
      }
    }
  }

  // Fallback to default shifts if no period has data
  if (shiftList.length === 0) {
    shiftList = await getShifts();
  }

  return staffList.map((staff) => {
    const staffShifts = shiftList.filter((s) => s.staff_id === staff.id);
    const shiftMap: Record<number, Shift> = {};
    staffShifts.forEach((s) => { shiftMap[s.day_of_week] = s; });
    return { staff, shifts: shiftMap };
  });
}


// ========== AI Shift Generator ==========

export async function generateAIShifts(
  staffList: (Staff & { role?: string })[],
  weeks: number,
  rules: string = "",
  history: { name: string; shifts: { day: number; val: string }[] }[] = []
): Promise<{ shifts: { week: number; staff_name: string; day: number; shift_start: string | null; shift_end: string | null; is_off: boolean }[]; usage?: { input: number; output: number }; error?: string }> {
  const staff = staffList.map((s) => ({ name: s.name, role: s.role || "agent" }));

  const response = await fetch("/api/generate-ai-shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff, weeks, rules, history }),
  });

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}
