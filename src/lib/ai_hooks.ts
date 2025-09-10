import { useEffect } from "react";
import { summarizeLast30Days } from "./ai";
import { useSupabaseAuth } from "./auth";

export function useBackgroundStructurer(run: boolean) {
  const { user } = useSupabaseAuth();
  useEffect(() => {
    if (!run || !user) return;
    summarizeLast30Days(user.id).catch(() => {});
  }, [run, user?.id]);
}


