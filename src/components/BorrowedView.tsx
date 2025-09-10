import { useMemo, useState } from "react";
import { addBorrow, getBorrows, markBorrowPaid, setBorrowStatus, type Borrow } from "../lib/storage";
import { Button } from "./ui/button";
import { formatRinggit } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";

export function BorrowedView() {
  const [borrows, setBorrows] = useState<Borrow[]>(() => getBorrows());
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<"all" | "overdue" | "nodate">("all");

  const unpaid = useMemo(() => {
    const list = borrows.filter((b) => b.status === "unpaid");
    return list.sort((a, b) => {
      const aKey = a.dueDate || "9999-12-31";
      const bKey = b.dueDate || "9999-12-31";
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
  }, [borrows]);
  const paid = useMemo(() => borrows.filter((b) => b.status === "paid"), [borrows]);
  const todayKey = new Date().toISOString().slice(0, 10);

  function parseYmd(ymd: string): Date {
    const [y, m, d] = ymd.split("-").map((n) => Number(n));
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function daysUntil(due: string): number {
    const dueDateObj = parseYmd(due);
    const todayObj = parseYmd(todayKey);
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((dueDateObj.getTime() - todayObj.getTime()) / msPerDay);
  }
  const DUE_SOON_DAYS = 3;

  function handleAdd() {
    const amt = Number(amount);
    if (!person.trim() || !Number.isFinite(amt) || amt <= 0) return;
    addBorrow({ person: person.trim(), amount: amt, note: note.trim() || undefined, dueDate });
    setBorrows(getBorrows());
    setPerson("");
    setAmount("");
    setNote("");
    setDueDate(undefined);
  }

  function togglePaid(b: Borrow) {
    if (b.status === "paid") {
      setBorrowStatus(b.id, "unpaid");
    } else {
      markBorrowPaid(b.id);
    }
    setBorrows(getBorrows());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-sm space-y-3">
        <div className="text-sm text-muted-foreground">Add Borrowed</div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border px-3 py-2" placeholder="Person" value={person} onChange={(e) => setPerson(e.target.value)} />
          <input className="w-28 rounded-md border px-3 py-2" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border px-3 py-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10">{dueDate || "Due date"}</Button>
            </PopoverTrigger>
            <PopoverContent className="p-2">
              <Calendar
                mode="single"
                selected={dueDate ? new Date(dueDate) : undefined}
                onSelect={(d) => setDueDate(d ? d.toISOString().slice(0,10) : undefined)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button className="w-full" onClick={handleAdd}>Add Borrowed</Button>
      </div>

      {unpaid.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Unpaid</div>
            <div className="inline-flex gap-1">
              <Button size="sm" variant={filter === "all" ? "secondary" : "outline"} onClick={() => setFilter("all")}>All</Button>
              <Button size="sm" variant={filter === "overdue" ? "secondary" : "outline"} onClick={() => setFilter("overdue")}>Overdue</Button>
              <Button size="sm" variant={filter === "nodate" ? "secondary" : "outline"} onClick={() => setFilter("nodate")}>No date</Button>
            </div>
          </div>
          <ul className="space-y-2">
            {unpaid
              .filter((b) => {
                if (filter === "all") return true;
                if (filter === "overdue") return !!b.dueDate && b.dueDate < todayKey;
                if (filter === "nodate") return !b.dueDate;
                return true;
              })
              .map((b) => {
                const isOverdue = !!b.dueDate && b.dueDate < todayKey;
                const isToday = !!b.dueDate && b.dueDate === todayKey;
                const futureDays = !!b.dueDate && b.dueDate > todayKey ? daysUntil(b.dueDate) : undefined;
                return (
                  <li key={b.id} className={`rounded-xl border p-3 animate-in fade-in-0 zoom-in-95 ${isOverdue ? "bg-red-50" : "bg-amber-50"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{b.person} - {formatRinggit(b.amount)}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {b.note ? <span>{b.note}</span> : null}
                          {b.note && (b.dueDate || isOverdue || isToday) ? <span>·</span> : null}
                          {b.dueDate ? (
                            <>
                              <span>Due {b.dueDate}</span>
                              {isOverdue && (
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Overdue</span>
                              )}
                              {isToday && !isOverdue && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">Due today</span>
                              )}
                              {futureDays !== undefined && futureDays > 0 && (
                                futureDays <= DUE_SOON_DAYS ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">Due soon · {futureDays} {futureDays === 1 ? "day" : "days"}</span>
                                ) : (
                                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Due in {futureDays} {futureDays === 1 ? "day" : "days"}</span>
                                )
                              )}
                            </>
                          ) : (
                            <span>No due date</span>
                          )}
                        </div>
                      </div>
                      <Button variant="secondary" onClick={() => togglePaid(b)}>Mark Paid</Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="text-sm font-medium">History</div>
        <ul className="space-y-2">
          {paid.map((b) => (
            <li key={b.id} className="rounded-xl border p-3 bg-green-50 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{b.person} - {formatRinggit(b.amount)}</div>
                  <div className="text-xs text-muted-foreground">Paid</div>
                </div>
                <Button variant="outline" onClick={() => togglePaid(b)}>Mark Unpaid</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}


