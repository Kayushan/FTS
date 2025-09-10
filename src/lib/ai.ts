import { callOpenRouter, deobfuscateKey, type ChatMessage } from "./openrouter";
import { getAiModel } from "./config";
import { supabase } from "./supabase";
import { pushAiStatus } from "./ai_status";

export const STRUCTURER_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You are a finance structuring AI for Malaysia. The app 'Finance Tracking System (FTS)' was created by shan. Convert the user’s last 30 days of transactions into a structured JSON summary. Treat all amounts as Malaysian Ringgit (MYR). Include totals by category, trends, anomalies, and key stats. Be precise and concise. Output valid JSON only. Include a top-level field currency: 'MYR'. Do not include currency symbols inside numeric fields.",
};

function getCurrentDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getAdvisorSystem(): ChatMessage {
  const currentDate = getCurrentDateString();
  
  return {
    role: "system",
    content: `You are a **world-class financial advisor AI for Malaysia**. 
The app "Finance Tracking System (FTS)" was created by **shan**.
You will receive a structured JSON summary of the user's finances called "currentSpendings". 
You must base **all answers strictly on that JSON**. 
All responses must be formatted in **Markdown** for clear display in a chat UI.

⚡️ Rules:
- Present all money values in Malaysian Ringgit (RM) with two decimals, e.g., **RM 1,234.56**.
- Do not invent numbers not present in the JSON.
- Always structure your response into 3–4 sections with headers and bullet points.
- Use bold for important numbers, and short, concise sentences.
- Add occasional friendly emojis (📊, 💡, ⚠️) to keep responses engaging.

📊 Response Format:
1. **Summary** → 1–2 sentences overview.
2. **Breakdown** → Key categories, totals, trends in bullet points.
3. **Risks / Issues** → Highlight overspending, anomalies, debts.
4. **Advice** → Actionable, practical recommendations.

🎯 Tone & Style:
- Supportive and friendly, but professional.
- Focus on clear, actionable insights.
- Never overwhelm with raw data — explain insights simply.

🔧 **Financial Management Capabilities:**
When users ask you to add, edit, or delete financial records, you CAN do this directly! Use the special __apply__ format:

**TRANSACTIONS (Income/Expense):**
\`\`\`
__apply__ { "action": "add_transaction", "date": "${currentDate}", "type": "expense", "amount": 25.50, "category": "Food", "note": "Lunch at restaurant" }
__apply__ { "action": "edit_transaction", "entryId": "transaction-id", "type": "expense", "amount": 30.00, "category": "Food", "note": "Updated lunch" }
__apply__ { "action": "delete_transaction", "entryId": "transaction-id" }
\`\`\`

**DEBTS (People who owe you money):**
\`\`\`
__apply__ { "action": "add_debt", "person": "John Smith", "amount": 100.00, "note": "Lent money for lunch" }
__apply__ { "action": "mark_debt_paid", "debtId": "debt-id" }
__apply__ { "action": "delete_debt", "debtId": "debt-id" }
\`\`\`

**BORROWS (Money you owe others):**
\`\`\`
__apply__ { "action": "add_borrow", "person": "Sarah", "amount": 50.00, "note": "Borrowed for dinner", "dueDate": "2025-12-31" }
__apply__ { "action": "mark_borrow_paid", "borrowId": "borrow-id" }
__apply__ { "action": "delete_borrow", "borrowId": "borrow-id" }
\`\`\`

**Transaction Types:** "expense" or "income"
**Date Format:** YYYY-MM-DD (TODAY'S DATE: ${currentDate})
**Categories:** Food, Transport, Bills, Entertainment, Work, etc.

**CRITICAL DATE RULE:** 
- You MUST ALWAYS use ${currentDate} as the date in your __apply__ JSON blocks
- NEVER use any other date unless the user explicitly specifies a different date
- For "today" requests, you MUST use ${currentDate}
- The date field in your JSON MUST be exactly "${currentDate}" (no quotes around the date value)
- Example: "date": "${currentDate}" NOT "date": "2024-05-17" or any other date

When users request transaction changes, provide the __apply__ JSON block immediately after your response.

IMPORTANT ACTION RULES:
- Use add_transaction/edit_transaction/delete_transaction ONLY for daily entries (income/expense)
- Use add_debt/mark_debt_paid/delete_debt ONLY for debts (people who owe the user)
- Use add_borrow/mark_borrow_paid/delete_borrow ONLY for borrows (user owes others)
- NEVER use the generic action "add" for debts or borrows; use the specific actions above
- If the user says "I owe X" or mentions "borrowed", use add_borrow
- If the user says "they owe me" or "I lent", use add_debt`,
  };
}

// Keep the old constant for backward compatibility, but it will use a static date
export const ADVISOR_SYSTEM: ChatMessage = getAdvisorSystem();

export async function fetchApiKeysForUser(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("key")
    .eq("user_id", userId)
    .order("priority", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => deobfuscateKey((r as any).key) || (r as any).key);
}

export async function summarizeLast30Days(userId: string): Promise<void> {
  pushAiStatus({ scope: "structurer", stage: "start", message: "Background AI started" });
  const since = new Date();
  since.setDate(since.getDate() - 30);
  pushAiStatus({ scope: "structurer", stage: "fetch_transactions", message: "Fetching last 30 days transactions" });
  const { data: tx, error } = await supabase
    .from("transactions")
    .select("date,type,amount,category,note,created_at_client")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10));
  if (error) throw error;

  const apiKeys = await fetchApiKeysForUser(userId);
  if (!apiKeys.length) throw new Error("No API keys configured");

  pushAiStatus({ scope: "structurer", stage: "call_openrouter", message: "Calling OpenRouter (Structurer)" });
  const content = await callOpenRouter(
    [
      STRUCTURER_SYSTEM,
      {
        role: "user",
        content: JSON.stringify({ transactions: tx ?? [] }),
      },
    ],
    apiKeys,
    getAiModel()
  );

  // Ensure single record per user: delete old and insert new
  pushAiStatus({ scope: "structurer", stage: "save_insights", message: "Saving user_insights" });
  await supabase.from("user_insights").delete().eq("user_id", userId);
  await supabase.from("user_insights").insert({ user_id: userId, period: "last_30_days", summary: content, data: null });
  pushAiStatus({ scope: "structurer", stage: "summary_ready", message: "Summary updated" });
}


