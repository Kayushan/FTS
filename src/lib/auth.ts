import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useSupabaseAuth() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null>(null);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session ?? null);
      setLoading(false);
      try {
        const id = data.session?.user?.id;
        if (id) localStorage.setItem("current_user_id", id);
      } catch {}
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      try {
        const id = newSession?.user?.id;
        if (id) localStorage.setItem("current_user_id", id);
      } catch {}
    });
    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return { loading, session, user: session?.user ?? null, signIn, signUp, signOut };
}


