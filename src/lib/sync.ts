import { supabase } from "./supabase";
import { getHistoryDates, getDayData, getDebts, getBorrows } from "./storage";

export type SyncStatus = "idle" | "pending" | "success" | "error";

export async function performFullSync(userId: string): Promise<void> {
  // Ensure user row exists for FK constraints
  await supabase.from("users").upsert({ id: userId }, { onConflict: "id" });

  // Transactions per day (entries)
  const dates = getHistoryDates();
  const transactionRows: any[] = [];
  for (const dateKey of dates) {
    const day = getDayData(dateKey);
    for (const e of day.entries) {
      transactionRows.push({
        user_id: userId,
        id_client: e.id,
        date: dateKey,
        type: e.type,
        amount: e.amount,
        category: e.category,
        note: e.note ?? null,
        created_at_client: e.createdAt,
      });
    }
  }
  if (transactionRows.length) {
    await supabase.from("transactions").upsert(transactionRows, { onConflict: "user_id,id_client" });
  }

  // Debts (you are owed money)
  const debts = getDebts();
  if (debts.length) {
    const debtRows = debts.map((d) => ({
      user_id: userId,
      id_client: d.id,
      person: d.person,
      amount: d.amount,
      note: d.note ?? null,
      status: d.status,
      created_at_client: d.createdAt,
      updated_at_client: d.updatedAt,
    }));
    await supabase.from("debts").upsert(debtRows, { onConflict: "user_id,id_client" });
  }

  // Borrows (you owe others)
  const borrows = getBorrows();
  if (borrows.length) {
    const borrowRows = borrows.map((b) => ({
      user_id: userId,
      id_client: b.id,
      person: b.person,
      amount: b.amount,
      note: b.note ?? null,
      due_date: b.dueDate ?? null,
      status: b.status,
      created_at_client: b.createdAt,
      updated_at_client: b.updatedAt,
    }));
    await supabase.from("borrows").upsert(borrowRows, { onConflict: "user_id,id_client" });
  }
}

export async function eraseAllCloudData(userId: string): Promise<void> {
  // Delete child rows first, then user row
  try { await supabase.from("transactions").delete().eq("user_id", userId); } catch {}
  try { await supabase.from("debts").delete().eq("user_id", userId); } catch {}
  try { await supabase.from("borrows").delete().eq("user_id", userId); } catch {}
  try { await supabase.from("user_insights").delete().eq("user_id", userId); } catch {}
  // Do NOT delete the users row to avoid cascading deletion of api_keys
}


