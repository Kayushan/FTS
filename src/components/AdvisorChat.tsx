import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabase";
import { getAdvisorSystem, fetchApiKeysForUser, summarizeLast30Days } from "../lib/ai";
import { callOpenRouterStream, type ChatMessage } from "../lib/openrouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAiModel } from "../lib/config";
import { pushAiStatus } from "../lib/ai_status";
import {
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Database,
  Save,
  Send as SendIcon,
  MessageCircle,
  Trash2,
  RefreshCw,
  Bot,
  User,
  Zap,
  X,
  ChevronDown
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
  const [showTyping, setShowTyping] = useState<boolean>(false);
  const [superAi, setSuperAi] = useState<boolean>(() => {
    try { return localStorage.getItem("super_ai_enabled") === "1"; } catch { return false; }
  });
  const processedTransactions = useRef<Set<string>>(new Set());
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const [currentActivity, setCurrentActivity] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const activityStartTime = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Auto-scroll to bottom when new messages arrive
  const autoScrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }, []);
  
  // Check if there's content below and show scroll indicator
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 50;
    setShowScrollIndicator(!isNearBottom && element.scrollHeight > element.clientHeight);
  }, []);
  

  
  // Enhanced error handling with retry logic
  const handleRetryableError = useCallback(async (operation: () => Promise<void>, operationName: string) => {
    try {
      setError(null);
      setAiError(null);
      await operation();
      setRetryCount(0);
    } catch (e: any) {
      const currentRetry = retryCount + 1;
      setRetryCount(currentRetry);
      
      if (e.code && e.retryable && currentRetry < maxRetries) {
        console.log(`Retrying ${operationName} (attempt ${currentRetry}/${maxRetries})`);
        setTimeout(() => handleRetryableError(operation, operationName), 2000 * currentRetry);
        return;
      }
      
      if (e.code) {
        setAiError(e);
      } else {
        setError(`${operationName} failed: ${e?.message ?? 'Unknown error'}`);
      }
    }
  }, [retryCount, maxRetries]);

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
    autoScrollToBottom();
  }, [messages, autoScrollToBottom]);
  
  useEffect(() => {
    autoScrollToBottom();
  }, [showTyping, autoScrollToBottom]);

  useEffect(() => {
    saveChat(messages);
  }, [messages]);
  


  async function refreshInsights() {
    if (!user) return;
    
    await handleRetryableError(async () => {
      setGenLoading(true);
      setCurrentActivity('Analyzing transactions');
      activityStartTime.current = Date.now();
      
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
      setGenLoading(false);
      
      // Show response time
      if (activityStartTime.current) {
        const responseTime = Date.now() - activityStartTime.current;
        setResponseTime(responseTime);
        setCurrentActivity(null);
        setTimeout(() => setResponseTime(null), 3000); // Clear after 3 seconds
      }
    }, 'Refresh insights');
  }

  function clearChat() {
    if (messages.length === 0) return;
    setShowClearConfirm(true);
  }
  
  function confirmClearChat() {
    setMessages([]);
    saveChat([]);
    processedTransactions.current.clear();
    setError(null);
    setAiError(null);
    setRetryCount(0);
    AICommandParser.clearProcessedCommands();
    setShowClearConfirm(false);
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
    setCurrentActivity('Processing your request');
    activityStartTime.current = Date.now();
    
    // Clear processed transactions for new conversation
    AICommandParser.clearProcessedCommands();
    processedTransactions.current.clear();
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
      
      // Show response time
      if (activityStartTime.current) {
        const responseTime = Date.now() - activityStartTime.current;
        setResponseTime(responseTime);
        setCurrentActivity(null);
        setTimeout(() => setResponseTime(null), 3000); // Clear after 3 seconds
      }
      
      setInput("");
    } finally {
      setLoading(false);
      setShowTyping(false);
    }
  }

  return (
    <div className="flex h-[80vh] flex-col rounded-2xl border-2 border-border/20 bg-gradient-to-br from-background to-card shadow-2xl overflow-hidden">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-border/20 backdrop-blur-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 shadow-lg">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">AI Financial Advisor</h3>
                {superAi && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full border border-green-500/30">
                    <Zap className="h-3 w-3 text-green-600" />
                    <span className="text-xs font-medium text-green-700">Super AI</span>
                  </div>
                )}
              </div>
              {(currentActivity || responseTime !== null) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {currentActivity && (
                    <span className="text-amber-600">{currentActivity}...</span>
                  )}
                  {responseTime !== null && !currentActivity && (
                    <span className="text-green-600">Response in {responseTime}ms</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {needsRefresh && (
              <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 rounded-full border border-amber-300">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                <span className="text-xs text-amber-700">Summary outdated</span>
              </div>
            )}
            <Button 
              size="sm" 
              variant="outline" 
              onClick={clearChat}
              className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
        
        {/* Summary Controls */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>Background AI Structurer:</span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              onClick={refreshInsights} 
              disabled={genLoading || !user}
              className="h-7 text-xs bg-primary/90 hover:bg-primary px-3"
            >
              {genLoading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Run Summary
                </>
              )}
            </Button>
            {!user && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 rounded-full border border-red-200">
                <X className="h-3 w-3 text-red-600" />
                <span className="text-xs text-red-700">Sign in required</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Error Display */}
      {(error || aiError) && (
        <div className="border-b border-border/20 bg-gradient-to-r from-red-50/50 to-orange-50/50">
          <div className="p-3">
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                <span>{error}</span>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => setError(null)}
                  className="ml-auto h-6 w-6 p-0 hover:bg-red-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            {aiError && (
              <ApiErrorDisplay
                error={AIErrorHandler.getUserMessage(aiError)}
                onRetry={AIErrorHandler.shouldShowRetry(aiError) ? () => {
                  setAiError(null);
                  setRetryCount(0);
                } : undefined}
                onDismiss={() => setAiError(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* Enhanced Chat Area - Full Space for AI Response */}
      <div ref={viewportRef} className="flex-1 overflow-hidden p-4 space-y-4 bg-gradient-to-b from-background/50 to-card/30">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary/60" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-foreground mb-2">Welcome to your AI Financial Advisor</h4>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Ask me about your spending patterns, get financial insights, or let me help manage your transactions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button 
                onClick={() => setInput("How much did I spend this week?")}
                className="px-3 py-1.5 bg-primary/10 rounded-full text-xs text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-all duration-200 cursor-pointer"
              >
                "How much did I spend this week?"
              </button>
              <button 
                onClick={() => setInput("Add expense: lunch RM15")}
                className="px-3 py-1.5 bg-primary/10 rounded-full text-xs text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-all duration-200 cursor-pointer"
              >
                "Add expense: lunch RM15"
              </button>
              <button 
                onClick={() => setInput("Show my spending by category")}
                className="px-3 py-1.5 bg-primary/10 rounded-full text-xs text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/30 transition-all duration-200 cursor-pointer"
              >
                "Show my spending by category"
              </button>
            </div>
          </div>
        ) : (
          <div 
            className="h-full overflow-y-auto pr-2 space-y-4 pb-24 relative no-scrollbar"
            onScroll={handleScroll}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex items-start gap-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ${
              m.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                m.role === "user" 
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg" 
                  : "bg-gradient-to-br from-primary to-primary/80 shadow-lg"
              }`}>
                {m.role === "user" ? (
                  <User className="h-4 w-4 text-white" />
                ) : (
                  <Bot className="h-4 w-4 text-primary-foreground" />
                )}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm border ${
                m.role === "user" 
                  ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-400/20 shadow-blue-500/20" 
                  : "bg-gradient-to-br from-card to-background border-border/20 shadow-foreground/5"
              }`}>
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border/20">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{m.content}</p>
                )}
              </div>
            </div>
            ))}
            <div ref={messagesEndRef} />
            
            {/* Scroll Down Indicator */}
            {showScrollIndicator && (
              <div className="absolute bottom-6 right-6 z-10">
                <Button
                  size="sm"
                  onClick={autoScrollToBottom}
                  className="w-10 h-10 rounded-full bg-primary/90 hover:bg-primary shadow-lg hover:shadow-xl transition-all duration-200 p-0"
                >
                  <ChevronDown className="h-4 w-4 text-primary-foreground animate-bounce" />
                </Button>
              </div>
            )}
          </div>
        )}
        
        {showTyping && (
          <div className="flex items-start gap-3 animate-in fade-in-0 slide-in-from-bottom-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="bg-gradient-to-br from-card to-background border border-border/20 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI is thinking...</span>
              </div>
            </div>
          </div>
        )}
        

      </div>

      {/* Enhanced Input Area */}
      <div className="border-t border-border/20 bg-gradient-to-r from-background to-card/50 backdrop-blur-sm">
        <div className="p-4 flex gap-3">
          <div className="flex-1 relative">
            <input
              className="w-full rounded-xl border-2 border-border/20 bg-background/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all duration-200 placeholder:text-muted-foreground/60 shadow-sm"
              placeholder="Ask about your finances, request insights, or add transactions..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading && input.trim()) send();
                }
              }}
              disabled={loading}
            />
            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            )}
          </div>
          <Button 
            onClick={send} 
            disabled={loading || !input.trim() || !user}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline font-medium">Send</span>
          </Button>
        </div>
        
        {/* Status Bar */}
        <div className="px-4 pb-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="font-medium">Model: {getAiModel()}</span>
            {!user && (
              <>
                <span>•</span>
                <span className="text-red-600 font-medium">Not authenticated</span>
              </>
            )}
            {user && insights && (
              <>
                <span>•</span>
                <span className="text-green-600 font-medium">Ready</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">● Ready</span>
          </div>
        </div>
      </div>
      
      {/* Custom Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200">
          <div className="bg-gradient-to-br from-card to-background border-2 border-border/20 rounded-2xl p-6 shadow-2xl max-w-md mx-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Clear Chat History</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone</p>
              </div>
            </div>
            
            <p className="text-foreground mb-6 leading-relaxed">
              Are you sure you want to clear all chat messages? This will permanently delete your conversation history with the AI advisor.
            </p>
            
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowClearConfirm(false)}
                className="px-6 hover:bg-muted/50"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmClearChat}
                className="px-6 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                Clear Chat
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


