export type ChatBubble = { role: "user" | "assistant"; content: string };
const CHAT_KEY = "advisor_chat_session";

export function loadChat(): ChatBubble[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as ChatBubble[]) : [];
  } catch {
    return [];
  }
}

export function saveChat(msgs: ChatBubble[]): void {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
  } catch {}
}


