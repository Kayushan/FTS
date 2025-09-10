import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import { getAdvisorSystem, fetchApiKeysForUser, summarizeLast30Days } from "../lib/ai";
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
import { addEntry, deleteEntry, updateEntry, addDebt, addBorrow, markDebtPaid, markBorrowPaid, setDebtStatus, setBorrowStatus } from "../lib/storage";
import { loadChat, saveChat } from "../lib/chat_store";

type ChatBubble = { role: "user" | "assistant"; content: string };

function getCurrentDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const processedTransactions = useRef<Set<string>>(new Set());

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
    processedTransactions.current.clear();
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
      setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: `Super AI enabled. I can now add, edit, and delete transactions upon your instruction.\n\nToday's date is ${getCurrentDateString()}. I will use this date for all "today" transactions.` }]);
      setInput("");
      return;
    }
    // Special command: RESET → clear chat and reset AI context
    if (input.trim().toUpperCase() === "RESET") {
      clearChat();
      processedTransactions.current.clear();
      setMessages((prev) => [...prev, { role: "user", content: input.trim() }, { role: "assistant", content: `Chat reset. Today's date is ${getCurrentDateString()}. Super AI is ${superAi ? 'enabled' : 'disabled'}.` }]);
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
    // Clear processed transactions for new conversation
    processedTransactions.current.clear();
    pushAiStatus({ scope: "advisor", stage: "sending_question", message: "Sending question to OpenRouter" });
    const systemPrompt = getAdvisorSystem();
    console.log("System prompt being sent to AI:", systemPrompt.content); // Debug log
    
    const history: ChatMessage[] = [
      systemPrompt,
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
        if (!superAi) {
          console.log("Super AI not enabled, skipping transaction parsing"); // Debug log
          return;
        }
        console.log("Super AI enabled, checking for __apply__ commands"); // Debug log
        // Parse inline commands when super AI is enabled
        const lower = assembled.toLowerCase();
        // Simple patterns: add/edit/delete commands the model might emit in plain text
        // e.g., "add expense 12.50 category Food note Lunch today"
        // For safety, only act when it includes keywords and amounts
        console.log("Checking for __apply__ in:", lower); // Debug log
        if (lower.includes("__apply__")) {
          // Models can emit a JSON block like: __apply__ { action: "add", date: "YYYY-MM-DD", type: "expense", amount: 12.5, category: "Food", note: "Lunch" }
          console.log("Found __apply__ in response:", assembled); // Debug log
          const start = assembled.indexOf("__apply__");
          console.log("__apply__ found at position:", start); // Debug log
          if (start !== -1) {
            const jsonStart = assembled.indexOf("{", start);
            if (jsonStart !== -1) {
              // Find the matching closing brace by counting braces
              let braceCount = 0;
              let jsonEnd = -1;
              for (let i = jsonStart; i < assembled.length; i++) {
                if (assembled[i] === '{') braceCount++;
                if (assembled[i] === '}') braceCount--;
                if (braceCount === 0) {
                  jsonEnd = i;
                  break;
                }
              }
              
              if (jsonEnd !== -1) {
                try {
                  const jsonString = assembled.slice(jsonStart, jsonEnd + 1).trim();
                  console.log("Parsing JSON:", jsonString); // Debug log
                  const payload = JSON.parse(jsonString);
                  console.log("Parsed payload:", payload); // Debug log
                  
                  // Normalize action to correctly route transactions vs debts vs borrows
                  let normalizedAction = String(payload.action || "").toLowerCase();
                  // Heuristics: if model used generic "add" for non-transaction records
                  if (normalizedAction === "add" || normalizedAction === "create") {
                    if (payload.type && (payload.category || payload.amount)) {
                      normalizedAction = "add_transaction";
                    } else if (payload.person && payload.dueDate) {
                      normalizedAction = "add_borrow";
                    } else if (payload.person && !payload.type) {
                      // Use text context to disambiguate borrow vs debt
                      if (lower.includes("borrow") || lower.includes(" i owe") || lower.includes("i owe ") || lower.includes(" owe ")) {
                        normalizedAction = "add_borrow";
                      } else {
                        normalizedAction = "add_debt";
                      }
                    }
                  }

                  // Create a unique identifier for this operation to prevent duplicates
                  let transactionId = "";
                  switch (normalizedAction) {
                    case "add_transaction":
                      transactionId = `${normalizedAction}-${payload.type}-${payload.amount}-${payload.category}-${payload.note || ''}-${payload.date || ''}`;
                      break;
                    case "edit_transaction":
                      transactionId = `${normalizedAction}-${payload.entryId || ''}-${payload.amount || ''}-${payload.category || ''}-${payload.note || ''}`;
                      break;
                    case "delete_transaction":
                      transactionId = `${normalizedAction}-${payload.entryId || ''}`;
                      break;
                    case "add_debt":
                      transactionId = `${normalizedAction}-${payload.person || ''}-${payload.amount || ''}-${payload.note || ''}`;
                      break;
                    case "add_borrow":
                      transactionId = `${normalizedAction}-${payload.person || ''}-${payload.amount || ''}-${payload.note || ''}-${payload.dueDate || ''}`;
                      break;
                    case "mark_debt_paid":
                    case "delete_debt":
                      transactionId = `${normalizedAction}-${payload.debtId || ''}`;
                      break;
                    case "mark_borrow_paid":
                    case "delete_borrow":
                      transactionId = `${normalizedAction}-${payload.borrowId || ''}`;
                      break;
                    default:
                      transactionId = `${String(payload.action || '').toLowerCase()}-${payload.type || ''}-${payload.amount || ''}-${payload.category || ''}-${payload.note || ''}-${payload.date || ''}-${payload.person || ''}-${payload.dueDate || ''}`;
                  }
                  
                  // Check if we've already processed this exact transaction
                  if (processedTransactions.current.has(transactionId)) {
                    console.log("Transaction already processed, skipping:", transactionId);
                    return;
                  }
                  
                  const currentDate = getCurrentDateString();
                  // Force correct date - always use today's date for "today" requests
                  const dateKey = currentDate;
                  
                  // Validate date
                  if (payload.date && payload.date !== currentDate) {
                    console.warn(`Date mismatch: AI provided ${payload.date}, but today is ${currentDate}. Using today's date instead.`);
                  }
                  
                  // Handle different action types
                  if (normalizedAction === "add_transaction") {
                  addEntry(dateKey, { type: payload.type, amount: Number(payload.amount), category: String(payload.category), note: payload.note ? String(payload.note) : undefined });
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                    console.log("Transaction added successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Transaction Successfully Added!**\n\nYour transaction has been processed and added to your FTS account.\nDate: ${dateKey}` }]);
                  } else if (normalizedAction === "delete_transaction" || (payload.action === "delete" && payload.entryId)) {
                  deleteEntry(dateKey, String(payload.entryId));
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                    console.log("Transaction deleted successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                  } else if (normalizedAction === "edit_transaction" || (payload.action === "edit" && payload.entryId)) {
                  updateEntry(dateKey, String(payload.entryId), { type: payload.type, amount: payload.amount ? Number(payload.amount) : undefined, category: payload.category, note: payload.note });
                  window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                    console.log("Transaction updated successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                  } else if (normalizedAction === "add_debt") {
                    addDebt({ 
                      person: String(payload.person), 
                      amount: Number(payload.amount), 
                      note: payload.note ? String(payload.note) : undefined 
                    });
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
                    console.log("Debt added successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Debt Successfully Added!**\n\n${payload.person} owes you RM ${payload.amount.toFixed(2)}.\nStatus: Unpaid` }]);
                  } else if (normalizedAction === "add_borrow") {
                    addBorrow({ 
                      person: String(payload.person), 
                      amount: Number(payload.amount), 
                      note: payload.note ? String(payload.note) : undefined,
                      dueDate: payload.dueDate ? String(payload.dueDate) : undefined
                    });
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "borrow" } }));
                    console.log("Borrow added successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Borrow Successfully Added!**\n\nYou owe ${payload.person} RM ${payload.amount.toFixed(2)}.\nStatus: Unpaid${payload.dueDate ? `\nDue Date: ${payload.dueDate}` : ''}` }]);
                  } else if (normalizedAction === "mark_debt_paid" && payload.debtId) {
                    markDebtPaid(String(payload.debtId));
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
                    console.log("Debt marked as paid successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Debt Marked as Paid!**\n\nDebt has been marked as paid and income record created.` }]);
                  } else if (normalizedAction === "mark_borrow_paid" && payload.borrowId) {
                    markBorrowPaid(String(payload.borrowId));
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "borrow" } }));
                    console.log("Borrow marked as paid successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Borrow Marked as Paid!**\n\nBorrow has been marked as paid and expense record created.` }]);
                  } else if (normalizedAction === "delete_debt" && payload.debtId) {
                    // Note: There's no deleteDebt function in storage.ts, so we'll mark as paid instead
                    setDebtStatus(String(payload.debtId), "paid");
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
                    console.log("Debt status updated successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Debt Status Updated!**\n\nDebt has been marked as paid.` }]);
                  } else if (normalizedAction === "delete_borrow" && payload.borrowId) {
                    // Note: There's no deleteBorrow function in storage.ts, so we'll mark as paid instead
                    setBorrowStatus(String(payload.borrowId), "paid");
                    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "borrow" } }));
                    console.log("Borrow status updated successfully"); // Debug log
                    
                    // Mark this transaction as processed
                    processedTransactions.current.add(transactionId);
                    
                    // Add a success message to the chat
                    setMessages((prev) => [...prev, { role: "assistant", content: `✅ **Borrow Status Updated!**\n\nBorrow has been marked as paid.` }]);
                  }
                } catch (error) {
                  console.error("JSON parsing error:", error); // Debug log
                }
              }
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
        <div className="text-sm font-medium">
          AI Advisor {superAi && <span className="text-green-600">(Super AI Enabled)</span>}
          <div className="text-xs text-muted-foreground">
            Today: {getCurrentDateString()} | Processed: {processedTransactions.current.size}
          </div>
        </div>
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


