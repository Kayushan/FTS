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
import { addEntry, addDebt, addBorrow } from "../lib/storage";
import { loadChat, saveChat } from "../lib/chat_store";
import { FinancialMath } from "../lib/decimal-math";
import { AICommandParser } from "../lib/ai-command-parser";
import { AIErrorHandler, type AIError } from "../lib/ai-error-handler";
import { ApiErrorDisplay } from "./ui/ErrorDisplay";

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
  const [aiError, setAiError] = useState<AIError | null>(null);
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
      setAiError(null);
      pushAiStatus({ scope: "structurer", stage: "start", message: "User requested summary refresh" });
      
      await AIErrorHandler.withRetry(
        () => summarizeLast30Days(user.id),
        'Refresh insights'
      );
      
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
      if (e.code) {
        // It's an AIError from AIErrorHandler
        setAiError(e);
      } else {
        setError(e?.message ?? "Failed to refresh summary");
      }
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
    setError(null);
    setAiError(null);
    // Clear processed transactions for new conversation
    AICommandParser.clearProcessedCommands();
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
      await AIErrorHandler.withRetry(
        () => callOpenRouterStream(history, apiKeys, getAiModel(), async (delta) => {
          deltaToState(delta);
          if (!superAi) {
            console.log("Super AI not enabled, skipping transaction parsing");
            return;
          }
          console.log("Super AI enabled, checking for __apply__ commands");
          
          // Enhanced AI command parsing with error handling
          const commands = await AIErrorHandler.withRetry(
            () => Promise.resolve(AICommandParser.parseCommand(assembled, processedTransactions.current)),
            'AI command parsing'
          ).catch((error: AIError) => {
            console.error('AI command parsing failed:', error);
            setAiError(error);
            return [];
          });
        
        for (const commandResult of commands) {
          if (!commandResult.success) {
            console.error('Command validation failed:', commandResult.error);
            setMessages((prev) => [...prev, { 
              role: "assistant", 
              content: `⚠️ **Command Error**: ${commandResult.error}` 
            }]);
            continue;
          }
          
          const command = commandResult.command!;
          const commandId = commandResult.commandId || AICommandParser.generateCommandId(command);
          
          // Enhanced duplicate prevention
          if (processedTransactions.current.has(commandId)) {
            console.log("Command already processed, skipping:", commandId);
            continue;
          }
          
          const currentDate = getCurrentDateString();
          const dateKey = currentDate;
          
          try {
            // Execute command with enhanced error handling
            await AIErrorHandler.withRetry(async () => {
              switch (command.action) {
              case "add_transaction":
                addEntry(dateKey, { 
                  type: command.type!, 
                  amount: command.amount!, 
                  category: command.category!, 
                  note: command.note 
                });
                window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { date: dateKey } }));
                console.log("Transaction added successfully");
                
                processedTransactions.current.add(commandId);
                setMessages((prev) => [...prev, { 
                  role: "assistant", 
                  content: `✅ **Transaction Successfully Added!**

Amount: RM ${FinancialMath.toFixed(command.amount!)}
Category: ${command.category}
Date: ${dateKey}` 
                }]);
                break;
                
              case "add_debt":
                addDebt({ 
                  person: command.person!, 
                  amount: command.amount!, 
                  note: command.note 
                });
                window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
                console.log("Receivable added successfully");
                
                processedTransactions.current.add(commandId);
                setMessages((prev) => [...prev, { 
                  role: "assistant", 
                  content: `✅ **Receivable Successfully Added!**

${command.person} owes you RM ${FinancialMath.toFixed(command.amount!)}.
Status: Outstanding` 
                }]);
                break;
                
              case "add_borrow":
                addBorrow({ 
                  person: command.person!, 
                  amount: command.amount!, 
                  note: command.note,
                  dueDate: command.dueDate
                });
                window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "borrow" } }));
                console.log("Payable added successfully");
                
                processedTransactions.current.add(commandId);
                setMessages((prev) => [...prev, { 
                  role: "assistant", 
                  content: `✅ **Payable Successfully Added!**

You owe ${command.person} RM ${FinancialMath.toFixed(command.amount!)}.
Status: Outstanding${command.dueDate ? `
Due Date: ${command.dueDate}` : ''}` 
                }]);
                break;
                
              // Add other cases as needed for edit, delete, etc.
              default:
                throw new Error(`Unknown action: ${command.action}`);
            }
            }, `Execute AI command: ${command.action}`);
            
            // Mark command as processed
            processedTransactions.current.add(commandId);
            
          } catch (error) {
            console.error('Error executing AI command:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessages((prev) => [...prev, { 
              role: "assistant", 
              content: `❌ **Error processing command**: ${errorMessage}` 
            }]);
            
            // Set AI error for user feedback
            if (error instanceof Error && error.name === 'AIError') {
              setAiError(error as any);
            }
          }
        }
        }),
        'AI streaming request'
      );
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
      {aiError && (
        <div className="p-3 border-b">
          <ApiErrorDisplay
            error={AIErrorHandler.getUserMessage(aiError)}
            onRetry={AIErrorHandler.shouldShowRetry(aiError) ? () => {
              setAiError(null);
              // Retry the last operation if needed
            } : undefined}
            onDismiss={() => setAiError(null)}
          />
        </div>
      )}
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


