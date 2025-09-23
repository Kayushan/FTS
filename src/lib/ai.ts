import { callOpenRouter, deobfuscateKey, type ChatMessage } from "./openrouter";
import { getAiModel } from "./config";
import { supabase } from "./supabase";
import { pushAiStatus } from "./ai_status";
import { FinancialMath } from "./decimal-math";

export const STRUCTURER_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You are a comprehensive finance structuring AI for Malaysia. The app 'Finance Tracking System (FTS)' was created by shan. Convert the user's financial data into a structured JSON summary that includes transactions, debts, and borrowed money. CRITICAL: Pay close attention to status fields and amount values. For debts and borrows: 'status' field indicates 'unpaid' or 'paid' - use is_unpaid and is_paid boolean fields for clarity. For amounts: use the 'amount' field (number) and 'amount_formatted' field (string with 2 decimals) - never confuse small amounts like 5.00 with larger amounts like 50.00. The input contains: 1) transactions (daily income/expense), 2) debts (money others owe the user), 3) borrows (money the user owes others). Treat all amounts as Malaysian Ringgit (MYR). Include totals by category, debt status breakdown, borrowing obligations, trends, anomalies, and key financial health indicators. Be precise and concise. Output valid JSON only. Include a top-level field currency: 'MYR'. Do not include currency symbols inside numeric fields. Include debt_summary and borrow_summary sections with accurate totals and status breakdowns. NEVER misinterpret debt status - unpaid means money is still owed, paid means money has been repaid.",
};

export function getAdvisorSystem(): ChatMessage {
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
__apply__ { "action": "add_transaction", "date": "YYYY-MM-DD", "type": "expense", "amount": 25.50, "category": "Food", "note": "Lunch at restaurant" }
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
**Date Format:** YYYY-MM-DD (use today's date for "today" or current transactions)
**Categories:** Food, Transport, Bills, Entertainment, Work, etc.

**Date Handling:**
- Use today's date when users refer to "today" or don't specify a date
- Accept user-specified dates naturally (e.g., "yesterday", "last Monday", "2024-01-15")
- For transaction dates, use the format YYYY-MM-DD
- When in doubt about the date, use today's date

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
  
  pushAiStatus({ scope: "structurer", stage: "fetch_transactions", message: "Fetching and validating comprehensive financial data" });
  
  // Fetch transactions (income/expense)
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select("date,type,amount,category,note,created_at_client")
    .eq("user_id", userId)
    .gte("date", since.toISOString().slice(0, 10));
  if (txError) throw txError;

  // Fetch debts (people who owe the user money)
  const { data: debts, error: debtsError } = await supabase
    .from("debts")
    .select("person,amount,note,status,created_at_client,updated_at_client")
    .eq("user_id", userId)
    .gte("created_at_client", since.toISOString());
  if (debtsError) throw debtsError;

  // Fetch borrows (money the user owes others)
  const { data: borrows, error: borrowsError } = await supabase
    .from("borrows")
    .select("person,amount,note,due_date,status,created_at_client,updated_at_client")
    .eq("user_id", userId)
    .gte("created_at_client", since.toISOString());
  if (borrowsError) throw borrowsError;

  // Validate and log data before processing
  console.log('Raw debt data from DB:', debts?.map(d => ({ person: d.person, amount: d.amount, status: d.status })));
  console.log('Raw borrow data from DB:', borrows?.map(b => ({ person: b.person, amount: b.amount, status: b.status })));

  const apiKeys = await fetchApiKeysForUser(userId);
  if (!apiKeys.length) throw new Error("No API keys configured");

  // Prepare comprehensive financial data with explicit formatting and validation
  const financialData = {
    transactions: (transactions ?? []).map(tx => {
      const validatedAmount = FinancialMath.round(Number(tx.amount));
      return {
        ...tx,
        amount: validatedAmount,
        amount_formatted: validatedAmount.toFixed(2),
        type: tx.type
      };
    }),
    debts: (debts ?? []).map(debt => {
      const validatedAmount = FinancialMath.round(Number(debt.amount));
      const validatedStatus = debt.status || 'unpaid'; // Ensure status is defined
      return {
        ...debt,
        amount: validatedAmount,
        amount_formatted: validatedAmount.toFixed(2),
        status: validatedStatus,
        is_unpaid: validatedStatus === 'unpaid',
        is_paid: validatedStatus === 'paid'
      };
    }),
    borrows: (borrows ?? []).map(borrow => {
      const validatedAmount = FinancialMath.round(Number(borrow.amount));
      const validatedStatus = borrow.status || 'unpaid'; // Ensure status is defined
      return {
        ...borrow,
        amount: validatedAmount,
        amount_formatted: validatedAmount.toFixed(2),
        status: validatedStatus,
        is_unpaid: validatedStatus === 'unpaid',
        is_paid: validatedStatus === 'paid'
      };
    }),
    period: "last_30_days",
    currency: "MYR",
    generated_at: new Date().toISOString(),
    summary_counts: {
      transactions: (transactions ?? []).length,
      debts: (debts ?? []).length,
      borrows: (borrows ?? []).length,
      unpaid_debts: (debts ?? []).filter(d => d.status === 'unpaid').length,
      paid_debts: (debts ?? []).filter(d => d.status === 'paid').length,
      unpaid_borrows: (borrows ?? []).filter(b => b.status === 'unpaid').length,
      paid_borrows: (borrows ?? []).filter(b => b.status === 'paid').length
    },
    totals: {
      total_debt_amount: FinancialMath.round(FinancialMath.sum((debts ?? []).map(d => d.amount))),
      unpaid_debt_amount: FinancialMath.round(FinancialMath.sum((debts ?? []).filter(d => d.status === 'unpaid').map(d => d.amount))),
      paid_debt_amount: FinancialMath.round(FinancialMath.sum((debts ?? []).filter(d => d.status === 'paid').map(d => d.amount))),
      total_borrow_amount: FinancialMath.round(FinancialMath.sum((borrows ?? []).map(b => b.amount))),
      unpaid_borrow_amount: FinancialMath.round(FinancialMath.sum((borrows ?? []).filter(b => b.status === 'unpaid').map(b => b.amount))),
      paid_borrow_amount: FinancialMath.round(FinancialMath.sum((borrows ?? []).filter(b => b.status === 'paid').map(b => b.amount))),
      income_total: FinancialMath.round(FinancialMath.sum((transactions ?? []).filter(t => t.type === 'income').map(t => t.amount))),
      expense_total: FinancialMath.round(FinancialMath.sum((transactions ?? []).filter(t => t.type === 'expense').map(t => t.amount)))
    }
  };

  // Log processed data for debugging
  console.log('Processed financial data for AI:', {
    debt_count: financialData.debts.length,
    borrow_count: financialData.borrows.length,
    sample_debt: financialData.debts[0],
    sample_borrow: financialData.borrows[0],
    totals: financialData.totals
  });

  pushAiStatus({ scope: "structurer", stage: "call_openrouter", message: "Calling OpenRouter (Structurer)" });
  const content = await callOpenRouter(
    [
      STRUCTURER_SYSTEM,
      {
        role: "user",
        content: JSON.stringify(financialData),
      },
    ],
    apiKeys,
    getAiModel()
  );

  // Ensure single record per user: delete old and insert new
  pushAiStatus({ scope: "structurer", stage: "save_insights", message: "Saving user_insights" });
  await supabase.from("user_insights").delete().eq("user_id", userId);
  await supabase.from("user_insights").insert({ 
    user_id: userId, 
    period: "last_30_days", 
    summary: content, 
    data: financialData 
  });
  pushAiStatus({ scope: "structurer", stage: "summary_ready", message: "Summary updated with comprehensive data" });
}


