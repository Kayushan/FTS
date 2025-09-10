import { useEffect, useMemo, useState } from "react";
import {
  addEntry,
  calculateTotals,
  DayData,
  deleteEntry,
  formatDate,
  getDayData,
  getHistoryDates,
  getStartingBalance,
  saveDayData,
  setStartingBalance,
  type EntryType,
} from "./lib/storage";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { Calendar } from "./components/ui/calendar";
import { EntryItem } from "./components/EntryItem";
import { formatRinggit } from "./lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./components/ui/alert-dialog";
import { eraseAllData } from "./lib/storage";
import { CategoryIcon } from "./lib/category-icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { DebtsView } from "./components/DebtsView";
import { BorrowedView } from "./components/BorrowedView";
import { Switch } from "./components/ui/switch";
import { useSupabaseAuth } from "./lib/auth";
import { performFullSync, eraseAllCloudData } from "./lib/sync";
import { AuthInline } from "./components/AuthInline";
import { AdvisorChat } from "./components/AdvisorChat";
import { KeysSettings } from "./components/KeysSettings";

type FormState = {
  type: EntryType;
  amount: string;
  category: string;
  note: string;
};

const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Bills",
  "Groceries",
  "Health",
  "Entertainment",
  "Shopping",
  "Other",
];
const INCOME_CATEGORIES = [
  "Salary",
  "Business",
  "Bonus",
  "Gift",
  "Interest",
  "Refund",
  "Other",
];

function useTodayKey() {
  const [dateKey, setDateKey] = useState<string>(formatDate(new Date()));
  return { dateKey, setDateKey };
}

export default function App() {
  const { dateKey, setDateKey } = useTodayKey();
  const { user, signOut } = useSupabaseAuth();
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState<boolean>(() => localStorage.getItem("cloud_sync_enabled") === "1");
  const [syncStatus, setSyncStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [day, setDay] = useState<DayData>(() => getDayData(dateKey));
  const [startingBalanceInput, setStartingBalanceInput] = useState<string>(() => {
    const s = getStartingBalance(dateKey);
    return s === null ? "" : String(s);
  });
  const [form, setForm] = useState<FormState>({ type: "expense", amount: "", category: EXPENSE_CATEGORIES[0], note: "" });

  useEffect(() => {
    setDay(getDayData(dateKey));
    const s = getStartingBalance(dateKey);
    setStartingBalanceInput(s === null ? "" : String(s));
  }, [dateKey]);

  useEffect(() => {
    function onDataChanged(e: any) {
      const d = e?.detail?.date || dateKey;
      if (d === dateKey) {
        setDay(getDayData(dateKey));
      }
    }
    window.addEventListener("fts-data-changed", onDataChanged);
    return () => window.removeEventListener("fts-data-changed", onDataChanged);
  }, [dateKey]);

  const totals = useMemo(() => calculateTotals({ ...day, startingBalance: Number(startingBalanceInput) || 0 }), [day, startingBalanceInput]);

  const todayKey = formatDate(new Date());
  const isToday = dateKey === todayKey;
  const hasStarting = getStartingBalance(dateKey) !== null;

  function handleSetStartingBalance() {
    const value = Number(startingBalanceInput) || 0;
    setStartingBalance(dateKey, value);
    const updated = { ...day, startingBalance: value };
    saveDayData(updated);
    setDay(updated);
  }

  async function triggerSync() {
    if (!cloudSyncEnabled || !user) return;
    try {
      setSyncStatus("pending");
      await performFullSync(user.id);
      setSyncStatus("success");
      setTimeout(() => setSyncStatus("idle"), 1500);
    } catch {
      setSyncStatus("error");
    }
  }

  function handleAddEntry() {
    if (!isToday) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (!form.category.trim()) return;
    addEntry(dateKey, { type: form.type, amount, category: form.category.trim(), note: form.note.trim() });
    setDay(getDayData(dateKey));
    setForm({ ...form, amount: "", note: "" });
    triggerSync();
  }

  function handleDelete(id: string) {
    if (!isToday) return;
    deleteEntry(dateKey, id);
    setDay(getDayData(dateKey));
    triggerSync();
  }

  return (
    <div className="mx-auto max-w-md p-4 space-y-4 safe-top safe-bottom">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between py-3">
          <div>
            <div className="text-xs text-muted-foreground">Remaining</div>
            <div className={`text-3xl font-bold ${totals.remaining < 0 ? "text-destructive" : "text-foreground"}`}>
              {formatRinggit(totals.remaining)}
            </div>
            {cloudSyncEnabled && (
              <div className="text-xs mt-1">
                {syncStatus === "success" && <span className="text-green-600">✔️ synced</span>}
                {syncStatus === "pending" && <span className="text-amber-600">⏳ pending</span>}
                {syncStatus === "error" && <span className="text-red-600">⚠️ error</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 px-3 text-sm">
                  {dateKey}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-2">
                <Calendar
                  mode="single"
                  selected={new Date(dateKey)}
                  onSelect={(d) => d && setDateKey(d.toISOString().slice(0, 10))}
                  disabled={(d) => d > new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" className="h-9 w-9" aria-label="Settings">⚙️</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Settings</DialogTitle>
                  <DialogDescription>Manage your app preferences.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">Enable Cloud Sync</div>
                      <div className="text-xs text-muted-foreground">Sync data with Supabase when online.</div>
                    </div>
                    <Switch
                      checked={cloudSyncEnabled}
                      onCheckedChange={(v) => {
                        setCloudSyncEnabled(Boolean(v));
                        localStorage.setItem("cloud_sync_enabled", Boolean(v) ? "1" : "0");
                        if (Boolean(v)) triggerSync();
                      }}
                    />
                  </div>

                  {cloudSyncEnabled ? (
                    <div className="space-y-2">
                      {!user ? (
                        <AuthInline />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="text-sm">Signed in as {user.email}</div>
                          <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {cloudSyncEnabled && user ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => triggerSync()}
                      disabled={syncStatus === "pending"}
                    >
                      {syncStatus === "pending" ? "Syncing..." : "Sync now"}
                    </Button>
                  ) : null}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">Erase all data</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Erase all data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove all balances and transactions from this device. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel asChild>
                          <Button variant="outline">Cancel</Button>
                        </AlertDialogCancel>
                        <AlertDialogAction asChild>
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              if (user) {
                                try { await eraseAllCloudData(user.id); } catch {}
                              }
                              eraseAllData();
                              setDay(getDayData(dateKey));
                              setStartingBalanceInput("");
                            }}
                          >
                            Erase
                          </Button>
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <Tabs defaultValue="tracker">
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="tracker" className="flex-1">Tracker</TabsTrigger>
          <TabsTrigger value="debts" className="flex-1">Debt</TabsTrigger>
          <TabsTrigger value="borrowed" className="flex-1">Borrowed</TabsTrigger>
          <TabsTrigger value="advisor" className="flex-1">AI Advisor</TabsTrigger>
          <TabsTrigger value="api-keys" className="flex-1">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="tracker" className="space-y-2">
          {isToday && !hasStarting && (
            <div className="rounded-xl bg-card p-4 shadow-sm">
              <div className="text-sm text-muted-foreground mb-1">Starting balance</div>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="flex-1 rounded-md border px-3 py-2"
                  value={startingBalanceInput}
                  onChange={(e) => setStartingBalanceInput(e.target.value)}
                />
                <Button onClick={handleSetStartingBalance}>Set</Button>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-card p-4 shadow-sm space-y-3 transition-shadow hover:shadow-md">
            <div className="flex gap-2 text-sm">
              <Button
                variant={form.type === "expense" ? "destructive" : "outline"}
                disabled={!isToday}
                onClick={() =>
                  setForm((f) => {
                    const nextCats = EXPENSE_CATEGORIES;
                    const nextCategory = nextCats.includes(f.category) ? f.category : nextCats[0];
                    return { ...f, type: "expense", category: nextCategory };
                  })
                }
              >
                Expense
              </Button>
              <Button
                variant={form.type === "income" ? "secondary" : "outline"}
                disabled={!isToday}
                onClick={() =>
                  setForm((f) => {
                    const nextCats = INCOME_CATEGORIES;
                    const nextCategory = nextCats.includes(f.category) ? f.category : nextCats[0];
                    return { ...f, type: "income", category: nextCategory };
                  })
                }
              >
                Income
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                placeholder="Amount"
                className="w-28 rounded-md border px-3 py-2"
                value={form.amount}
                disabled={!isToday}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <div className="flex-1">
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))} disabled={!isToday}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="inline-flex items-center gap-2">
                          <CategoryIcon name={c} type={form.type} />
                          {c}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <input
              placeholder="Note (optional)"
              className="w-full rounded-md border px-3 py-2"
              value={form.note}
              disabled={!isToday}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
            <Button className="w-full" onClick={handleAddEntry} disabled={!isToday}>
              Add {form.type}
            </Button>
          </div>

          <section className="rounded-xl bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex justify-between text-sm">
              <div className="text-green-600 font-medium">Income: {formatRinggit(totals.income)}</div>
              <div className="text-red-600 font-medium">Expenses: {formatRinggit(totals.expenses)}</div>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Entries</h2>
            <ul className="space-y-2">
              {day.entries.map((e) => (
                <EntryItem key={e.id} entry={e} onDelete={handleDelete} readOnly={!isToday} />
              ))}
            </ul>
          </section>

          <section className="rounded-xl bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="text-sm font-medium mb-2">History</div>
            <div className="flex gap-2 overflow-x-auto">
              {getHistoryDates().map((d) => (
                <Button key={d} variant={d === dateKey ? "secondary" : "outline"} onClick={() => setDateKey(d)}>
                  {d}
                </Button>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="debts">
          <DebtsView />
        </TabsContent>

        <TabsContent value="borrowed">
          <BorrowedView />
        </TabsContent>

        <TabsContent value="advisor">
          <AdvisorChat />
        </TabsContent>

        <TabsContent value="api-keys">
          <KeysSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}


