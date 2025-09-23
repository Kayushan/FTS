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
  getYesterdayEndingBalance,
  saveDayData,
  setStartingBalance,
  type EntryType,
} from "./lib/storage";
import { InputValidator } from "./lib/validation";
import { Button } from "./components/ui/button";
import { LoadingProvider, useAsyncOperation } from "./contexts/LoadingContext";
import { FormErrorDisplay, ApiErrorDisplay } from "./components/ui/ErrorDisplay";
import { Loading } from "./components/ui/Loading";
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
import { DateUtils } from "./lib/date-utils";
import { CategoryIcon } from "./lib/category-icons";
import { eraseAllData } from "./lib/storage";
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

type ErrorState = {
  sync: string | null;
  form: string | null;
  balance: string | null;
  general: string | null;
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

function AppContent() {
  const { dateKey, setDateKey } = useTodayKey();
  const { user, signOut } = useSupabaseAuth();
  const { executeWithLoading } = useAsyncOperation();
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState<boolean>(() => localStorage.getItem("cloud_sync_enabled") === "1");
  const [syncStatus, setSyncStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [day, setDay] = useState<DayData>(() => getDayData(dateKey));
  const [startingBalanceInput, setStartingBalanceInput] = useState<string>(() => {
    const s = getStartingBalance(dateKey);
    return s === null ? "" : String(s);
  });
  const [form, setForm] = useState<FormState>({ type: "expense", amount: "", category: EXPENSE_CATEGORIES[0], note: "" });
  const [showBalanceContinuation, setShowBalanceContinuation] = useState<boolean>(false);
  const [yesterdayBalance, setYesterdayBalance] = useState<number | null>(null);
  const [errors, setErrors] = useState<ErrorState>({
    sync: null,
    form: null,
    balance: null,
    general: null
  });

  useEffect(() => {
    setDay(getDayData(dateKey));
    const s = getStartingBalance(dateKey);
    setStartingBalanceInput(s === null ? "" : String(s));
    
    // Check if it's a new day and show balance continuation prompt
    const todayKey = formatDate(new Date());
    if (dateKey === todayKey && s === null) {
      const yesterdayBal = getYesterdayEndingBalance();
      if (yesterdayBal !== null) {
        setYesterdayBalance(yesterdayBal);
        setShowBalanceContinuation(true);
      }
    }
  }, [dateKey]);

  useEffect(() => {
    function onDataChanged(e: any) {
      const d = e?.detail?.date || dateKey;
      const type = e?.detail?.type;
      
      // Refresh if it's the current date or if debts/borrows changed (affects balance)
      if (d === dateKey || type === "debt" || type === "borrow") {
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
    const validation = InputValidator.validateAmount(startingBalanceInput);
    if (!validation.isValid) {
      setErrors(prev => ({ ...prev, balance: validation.error || 'Invalid starting balance' }));
      return;
    }
    
    try {
      setErrors(prev => ({ ...prev, balance: null }));
      const value = validation.value || 0;
      setStartingBalance(dateKey, value);
      const updated = { ...day, startingBalance: value };
      saveDayData(updated);
      setDay(updated);
    } catch (error) {
      setErrors(prev => ({ ...prev, balance: 'Failed to set starting balance' }));
    }
  }

  function handleContinueWithYesterdayBalance() {
    if (yesterdayBalance !== null) {
      setStartingBalanceInput(String(yesterdayBalance));
      setStartingBalance(dateKey, yesterdayBalance);
      const updated = { ...day, startingBalance: yesterdayBalance };
      saveDayData(updated);
      setDay(updated);
    }
    setShowBalanceContinuation(false);
  }

  function handleSetNewBalance() {
    setShowBalanceContinuation(false);
    // User can now manually set their balance
  }

  async function triggerSync() {
    if (!cloudSyncEnabled || !user) return;
    try {
      setErrors(prev => ({ ...prev, sync: null }));
      setSyncStatus("pending");
      await executeWithLoading('sync', () => performFullSync(user.id));
      setSyncStatus("success");
      setTimeout(() => setSyncStatus("idle"), 1500);
    } catch (error) {
      setSyncStatus("error");
      setErrors(prev => ({ 
        ...prev, 
        sync: error instanceof Error ? error.message : 'Sync failed. Please try again.' 
      }));
    }
  }

  async function handleAddEntry() {
    if (!isToday) return;
    
    try {
      setErrors(prev => ({ ...prev, form: null }));
      
      // Validate amount using InputValidator
      const amountValidation = InputValidator.validateAmount(form.amount);
      if (!amountValidation.isValid) {
        setErrors(prev => ({ ...prev, form: amountValidation.error || 'Invalid amount' }));
        return;
      }
      
      // Validate category
      const categoryValidation = InputValidator.validateCategory(
        form.category, 
        form.type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
      );
      if (!categoryValidation.isValid) {
        setErrors(prev => ({ ...prev, form: categoryValidation.error || 'Invalid category' }));
        return;
      }
      
      // Validate note (optional)
      const noteValidation = InputValidator.validateNote(form.note);
      if (!noteValidation.isValid) {
        setErrors(prev => ({ ...prev, form: noteValidation.error || 'Invalid note' }));
        return;
      }
      
      const amount = amountValidation.value!;
      const category = categoryValidation.value!;
      const note = noteValidation.value;
      
      await executeWithLoading('add-entry', async () => {
        addEntry(dateKey, { type: form.type, amount, category, note });
        setDay(getDayData(dateKey));
        setForm({ ...form, amount: "", note: "" });
      });
      
      triggerSync();
    } catch (error) {
      setErrors(prev => ({ 
        ...prev, 
        form: error instanceof Error ? error.message : 'Failed to add entry' 
      }));
    }
  }

  async function handleDelete(id: string) {
    if (!isToday) return;
    try {
      await executeWithLoading('delete-entry', async () => {
        deleteEntry(dateKey, id);
        setDay(getDayData(dateKey));
      });
      triggerSync();
    } catch (error) {
      setErrors(prev => ({ 
        ...prev, 
        general: error instanceof Error ? error.message : 'Failed to delete entry' 
      }));
    }
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
                  onSelect={(d) => d && setDateKey(DateUtils.formatDate(d))}
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

                  {errors.sync && (
                    <ApiErrorDisplay
                      error={errors.sync}
                      onRetry={() => triggerSync()}
                      onDismiss={() => setErrors(prev => ({ ...prev, sync: null }))}
                    />
                  )}

                  {cloudSyncEnabled && user ? (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => triggerSync()}
                    >
                      "Sync now"
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
                              try {
                                if (user) {
                                  await executeWithLoading('erase-data', () => eraseAllCloudData(user.id));
                                }
                                eraseAllData();
                                setDay(getDayData(dateKey));
                                setStartingBalanceInput("");
                              } catch (error) {
                                setErrors(prev => ({ 
                                  ...prev, 
                                  general: 'Failed to erase data completely' 
                                }));
                              }
                            }}
                            disabled={false}
                          >
                            'Erase'
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
          <TabsTrigger value="debts" className="flex-1">Receivables</TabsTrigger>
          <TabsTrigger value="borrowed" className="flex-1">Payables</TabsTrigger>
          <TabsTrigger value="advisor" className="flex-1">AI Advisor</TabsTrigger>
          <TabsTrigger value="api-keys" className="flex-1">API Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="tracker" className="space-y-2">
          {errors.general && (
            <ApiErrorDisplay
              error={errors.general}
              onDismiss={() => setErrors(prev => ({ ...prev, general: null }))}
            />
          )}

          {showBalanceContinuation && (
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-6 shadow-lg">
              <div className="text-lg font-semibold text-blue-900 mb-2">🌅 New Day - Balance Continuation</div>
              <div className="text-sm text-blue-700 mb-4">
                Yesterday's ending balance: <span className="font-bold text-blue-900">{formatRinggit(yesterdayBalance || 0)}</span>
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={handleContinueWithYesterdayBalance}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
                >
                  ✅ Continue with Yesterday's Balance
                </Button>
                <Button 
                  onClick={handleSetNewBalance}
                  variant="outline"
                  className="flex-1 border-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400 font-medium py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  🔄 Set New Balance
                </Button>
              </div>
            </div>
          )}
          
          {isToday && !hasStarting && !showBalanceContinuation && (
            <div className="rounded-lg bg-white border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">Set Starting Balance</h3>
                  <p className="text-sm text-gray-600 mb-4">Enter your account balance to begin tracking your finances today</p>
                  
                  {errors.balance && (
                    <FormErrorDisplay error={errors.balance} fieldName="Starting Balance" />
                  )}
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label htmlFor="starting-balance" className="sr-only">Starting balance amount</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-sm">RM</span>
                        </div>
                        <input
                          id="starting-balance"
                          inputMode="decimal"
                          placeholder="0.00"
                          className="block w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 bg-gray-50 focus:bg-white"
                          value={startingBalanceInput}
                          onChange={(e) => {
                            setStartingBalanceInput(e.target.value);
                            if (errors.balance) {
                              setErrors(prev => ({ ...prev, balance: null }));
                            }
                          }}
                          aria-label="Starting balance amount"
                          aria-describedby="starting-balance-error"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={handleSetStartingBalance}
                      className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 shadow-sm hover:shadow-md"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Set Balance
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-card p-4 shadow-sm space-y-3 transition-shadow hover:shadow-md">
            <div className="flex gap-2 text-sm">
              <Button
                variant="outline"
                disabled={!isToday}
                className={form.type === "expense" 
                  ? "bg-red-600 hover:bg-red-700 text-white border-red-600 font-semibold" 
                  : "hover:bg-red-50 hover:border-red-300"
                }
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
                variant="outline"
                disabled={!isToday}
                className={form.type === "income" 
                  ? "bg-green-600 hover:bg-green-700 text-white border-green-600 font-semibold" 
                  : "hover:bg-green-50 hover:border-green-300"
                }
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
            
            {errors.form && (
              <FormErrorDisplay error={errors.form} fieldName="Entry" />
            )}
            
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                placeholder="Amount"
                className="w-28 rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                value={form.amount}
                disabled={!isToday}
                onChange={(e) => {
                  setForm((f) => ({ ...f, amount: e.target.value }));
                  if (errors.form) {
                    setErrors(prev => ({ ...prev, form: null }));
                  }
                }}
                aria-label="Entry amount"
              />
              <div className="flex-1">
                <Select 
                  value={form.category} 
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))} 
                  disabled={!isToday}
                >
                  <SelectTrigger aria-label="Select category">
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
              className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
              value={form.note}
              disabled={!isToday}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-label="Entry note"
            />
            <Button 
              className="w-full" 
              onClick={handleAddEntry} 
              disabled={!isToday}
            >
              {form.type === "expense" ? "Add Expense" : "Add Income"}
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
            {false && (
              <div className="flex items-center justify-center p-4">
                <Loading variant="spinner" size="md" />
                <span className="ml-2 text-sm text-muted-foreground">Deleting entry...</span>
              </div>
            )}
            <ul className="space-y-2" role="list" aria-label="Transaction entries">
              {day.entries.map((e) => (
                <EntryItem 
                  key={e.id} 
                  entry={e} 
                  onDelete={handleDelete} 
                  readOnly={!isToday}
                />
              ))}
            </ul>
            {day.entries.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No entries for this day</p>
                {isToday && <p className="text-sm mt-1">Add your first transaction above</p>}
              </div>
            )}
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

export default function App() {
  return (
    <LoadingProvider>
      <AppContent />
    </LoadingProvider>
  );
}


