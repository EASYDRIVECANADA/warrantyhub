import { createClient } from "@supabase/supabase-js";

// Session-less client for public brochure queries.
// Uses a no-op storage so it never reads the user's session from localStorage,
// guaranteeing requests are made as the anon role regardless of login state.
const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const noopStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
};

export const supabaseAnon = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storage: noopStorage,
  },
});
