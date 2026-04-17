export interface Group {
  id: number;
  title: string;
  is_monitored: boolean;
  member_count: number | null;
  message_count: number;
  last_activity: string | null;
}

export interface Message {
  id: number;
  telegram_msg_id: number;
  group_id: number;
  group_title: string;
  sender_name: string;
  text: string;
  date: string;
  matched_keywords: string[];
  created_at: string;
  analysis: Analysis | null;
}

export interface Analysis {
  id: number;
  summary: string;
  sentiment: "positive" | "negative" | "neutral" | "urgent";
  category: "complaint" | "mention" | "issue" | "info" | "praise" | "request";
  urgency: number;
  details?: Record<string, unknown>;
}

export interface Alert {
  id: number;
  group_id: number;
  group_title: string;
  title: string;
  description: string;
  urgency: number;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
  text?: string;
}

export interface Keyword {
  id: number;
  keyword: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_messages_today: number;
  total_alerts: number;
  unread_alerts: number;
  active_groups: number;
  messages_by_hour: { hour: number; count: number }[];
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

export interface WSEvent {
  type: "new_alert" | "new_message" | "stats_update";
  data: Record<string, unknown>;
}
