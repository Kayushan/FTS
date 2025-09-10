import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import { ADVISOR_SYSTEM, fetchApiKeysForUser, summarizeLast30Days } from "../lib/ai";
import { callOpenRouterStream, type ChatMessage } from "../lib/openrouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAiModel } from "../lib/config";
import { pushAiStatus, useAiStatusFeed } from "../lib/ai_status";
import {
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Database,
  Save,
  Send as SendIcon,
  MessageCircle,
} from "lucide-react";
import { useSupabaseAuth } from "../lib/auth";
import { addEntry, deleteEntry, updateEntry } from "../lib/storage";
import { loadChat, saveChat } from "../lib/chat_store";

type ChatBubble = { role: "user" | "assistant"; content: string };

export function AdvisorChat() {
  const { user } = useSupabaseAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatBubble[]>(() => loadChat());
  const [insights, setInsights] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const statusFeed = useAiStatusFeed();
  const [statusExpanded, setStatusExpanded] = useState<boolean>(false);
  const [showTyping, setShowTyping] = useState<boolean>(false);
  const [superAi, setSuperAi] = useState<boolean>(() => {
    try { return localStorage.getItem("super_ai_enabled") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_insights")
        .select("summary, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setInsights(data?.summary ?? null);
      if (data?.created_at) {
        const { count } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gt("created_at", data.created_at);
        setNeedsRefresh((count ?? 0) > 0);
      } else {
        setNeedsRefresh(true);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  async function refreshInsights() {
    if (!user) return;
    try {
      setGenLoading(true);
      setError(null);
      pushAiStatus({ scope: "structurer", stage: "start", message: "User requested summary refresh" });
      await summarizeLast30Days(user.id);
      const { data } = await supabase
        .from("user_insights")
        .select("summary, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setInsights(data?.summary ?? null);
      setNeedsRefresh(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh summary");
    } finally {
      setGenLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    saveChat([]);
  }

  async function send() {
    if (!user) { setError("Sign in to use AI Advisor"); return; }
    if (!input.trim()) return;
    // Special command: CLEAR → clear local chat history
    if (input.trim().toUpperCase() === "CLEAR") {
      clearChat();
      setInput("");
      return;
    }
    // Special command: SUDOSHAN → enable super AI mode
    if (input.trim().toUpperCase() === "SUDOSHAN") {
      setSuperAi(true);
      try { localStorage.setItem("super_ai_enabled", "1"); } catch {}
      setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: "Super AI enabled. I can now add, edit, and delete transactions upon your instruction." }]);
      setInput("");
      return;
    }
    // Special command: ERASE → delete user_insights for this user
    if (input.trim().toUpperCase() === "ERASE") {
      try {
        setLoading(true);
        setError(null);
        await supabase.from("user_insights").delete().eq("user_id", user.id);
        setInsights(null);
        setNeedsRefresh(true);
        setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: "Insights erased. You can Refresh Summary to regenerate." }]);
      } finally {
        setLoading(false);
        setInput("");
      }
      return;
    }
    const apiKeys = await fetchApiKeysForUser(user.id);
    if (!apiKeys.length) { setError("Add an OpenRouter API key in API Keys tab"); return; }
    if (!insights) {
      await refreshInsights();
      if (!insights) return; // still no insights
    }
    setLoading(true);
    setShowTyping(true);
    pushAiStatus({ scope: "advisor", stage: "sending_question", message: "Sending question to OpenRouter" });
    const history: ChatMessage[] = [
      ADVISOR_SYSTEM,
      { role: "assistant", content: `currentSpendings: ${insights}` },
      ...messages.map((m) => ({ role: m.role, content: m.content } as ChatMessage)),
      { role: "user", content: input.trim() },
    ];
    try {
      let assembled = "";
      // Add user message and a placeholder assistant message for streaming
      setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: "" }]);
      let firstChunk = true;
      const deltaToState = (delta: string) => {
        assembled += delta;
        if (firstChunk) {
          setShowTyping(false);
          firstChunk = false;
        }
        setMessages((prev) => {
          const copy = [...prev];
          // Replace last assistant bubble
          copy[copy.length - 1] = { role: "assistant", content: assembled };
          return copy;
        });
      };
      await callOpenRouterStream(history, apiKeys, getAiModel(), async (delta) => {
        deltaToState(delta);
        if (!superAi) return;
        // Parse inline commands when super AI is enabled
        const lower = assembled.toLowerCase();
        // Simple patterns: add/edit/delete commands the model might emit in plain text
        // e.g., "add expense 12.50 category Food note Lunch today"
        // For safety, only act when it includes keywords and amounts
        if (lower.includes("__apply__")) {
          // Models can emit a JSON block like: __apply__ { action: "add", date: "YYYY-MM-DD", type: "expense", amount: 12.5, category: "Food", note: "Lunch" }
          const start = assembled.indexOf("__apply__");
          if (start !== -1) {
            const jsonStart = assembled.indexOf("{", start);
            const jsonEnd = assembled.indexOf("}", jsonStart);
            if (jsonStart !== -1 && jsonEnd !== -1) {
              try {
                const payload = JSON.parse(assembled.slice(jsonStart, jsonEnd + 1));
                const dateKey = payload.date || new Date().toISOString().slice(0, 10);
                if (payload.action === "add") {
                  addEntry(dateKey, { type: payload.type, amount: Number(payload.amount), category: String(payload.category), note: payload.note ? String(payload.note) : undefined });
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                } else if (payload.action === "delete" && payload.entryId) {
                  deleteEntry(dateKey, String(payload.entryId));
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                } else if (payload.action === "edit" && payload.entryId) {
                  updateEntry(dateKey, String(payload.entryId), { type: payload.type, amount: payload.amount ? Number(payload.amount) : undefined, category: payload.category, note: payload.note });
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                }
              } catch {}
            }
          }
        }
      });
      pushAiStatus({ scope: "advisor", stage: "received_answer", message: "Received advisor response" });
      setInput("");
    } finally {
      setLoading(false);
      setShowTyping(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border bg-card safe-bottom">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="text-sm font-medium">AI Advisor</div>
        <div className="flex items-center gap-2">
          {needsRefresh && <div className="text-xs text-amber-700">Summary outdated or missing</div>}
          <Button size="sm" variant="outline" onClick={clearChat}>Clear Chat</Button>
        </div>
      </div>
      <div className="p-3 border-b text-xs flex items-center gap-2">
        <div>Background AI (Structurer):</div>
        <Button size="sm" onClick={refreshInsights} disabled={genLoading || !user}>
          {genLoading ? "Running..." : "Run Summary"}
        </Button>
        {!user && <span className="text-red-600">Sign in required</span>}
      </div>
      {error && <div className="p-3 border-b text-xs text-red-700">{error}</div>}
      <div ref={viewportRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-lg p-2 fade-in ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted"}`}>
            {m.role === "assistant" ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            ) : (
              m.content
            )}
          </div>
        ))}
        {showTyping && (
          <div className="max-w-[85%] mr-auto rounded-lg p-2 bg-muted inline-flex items-center gap-2 text-xs text-muted-foreground fade-in">
            <Loader2 className="h-3 w-3 animate-spin" />
            Assistant is typing...
          </div>
        )}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Activity className="h-3 w-3" /> AI Activity
            </div>
            <Button size="sm" variant="ghost" onClick={() => setStatusExpanded((v) => !v)}>
              {statusExpanded ? "Hide" : "Show"}
            </Button>
          </div>
          {statusExpanded && (
            <ul className="mt-2 space-y-1">
              {statusFeed.slice(-12).map((ev) => {
                const icon = ev.stage === "fetch_transactions"
                  ? <Database className="h-3 w-3" />
                  : ev.stage === "call_openrouter"
                  ? <MessageCircle className="h-3 w-3" />
                  : ev.stage === "save_insights"
                  ? <Save className="h-3 w-3" />
                  : ev.stage === "summary_ready"
                  ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                  : ev.stage === "sending_question"
                  ? <SendIcon className="h-3 w-3" />
                  : ev.stage === "received_answer"
                  ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                  : ev.stage === "error"
                  ? <AlertTriangle className="h-3 w-3 text-red-600" />
                  : <Loader2 className="h-3 w-3 animate-spin" />;
                return (
                  <li key={ev.id} className="text-[11px] text-muted-foreground flex items-center gap-2">
                    {icon}
                    <span className="uppercase tracking-wide text-[10px] px-1 py-0.5 rounded bg-muted">{ev.scope}</span>
                    <span className="text-foreground">{ev.message}</span>
                    <span className="ml-auto opacity-60">{new Date(ev.time).toLocaleTimeString()}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          className="flex-1 rounded-md border px-3 py-2"
          placeholder="Ask about your spendings..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!loading && input.trim()) send();
            }
          }}
        />
        <Button onClick={send} disabled={loading || !input.trim()}>Send</Button>
      </div>
    </div>
  );
}


