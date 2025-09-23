export type AiScope = "structurer" | "advisor";
export type AiStage =
  | "start"
  | "fetch_transactions"
  | "fetch_debts"
  | "fetch_borrows"
  | "call_openrouter"
  | "save_insights"
  | "summary_ready"
  | "sending_question"
  | "received_answer"
  | "error";

export type AiStatusEvent = {
  id: string;
  time: string; // ISO
  scope: AiScope;
  stage: AiStage;
  message: string;
};

const MAX_EVENTS = 200;
let events: AiStatusEvent[] = [];
let listeners: Array<(evs: AiStatusEvent[]) => void> = [];

export function pushAiStatus(partial: Omit<AiStatusEvent, "id" | "time"> & { time?: string }) {
  const event: AiStatusEvent = {
    id: crypto.randomUUID(),
    time: partial.time ?? new Date().toISOString(),
    scope: partial.scope,
    stage: partial.stage,
    message: partial.message,
  };
  events.push(event);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  for (const l of listeners) l(events);
}

export function subscribeAiStatus(cb: (evs: AiStatusEvent[]) => void) {
  listeners.push(cb);
  cb(events);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

// React hook (kept here to avoid another file)
import { useEffect, useState } from "react";
export function useAiStatusFeed() {
  const [feed, setFeed] = useState<AiStatusEvent[]>(events);
  useEffect(() => subscribeAiStatus(setFeed), []);
  return feed;
}


