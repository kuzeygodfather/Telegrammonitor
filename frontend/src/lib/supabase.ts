import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Token'ı header'a ekleyen Supabase client factory
function createSupabaseClient() {
  if (typeof window === "undefined") {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  const token = localStorage.getItem("tg_session_token") || "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        "x-session-token": token,
      },
    },
  });
}

// Static export için window kontrolü
export const supabase = createSupabaseClient();

// Token değişince client'ı yenile
export function getSupabaseWithToken(): any {
  if (typeof window === "undefined") return supabase;
  const token = localStorage.getItem("tg_session_token") || "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        "x-session-token": token,
      },
    },
  });
}

export function getUserId(): number {
  if (typeof window === "undefined") return 0;
  try {
    const user = JSON.parse(localStorage.getItem("tg_user") || "{}");
    return user.id || 0;
  } catch {
    return 0;
  }
}

export function getUser(): { id: number; username: string; is_admin: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(localStorage.getItem("tg_user") || "null");
    return user;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getUserId() > 0;
}
