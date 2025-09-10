import { useMemo, useState } from "react";
import { addDebt, getDebts, markDebtPaid, setDebtStatus, type Debt } from "../lib/storage";
import { Button } from "./ui/button";
import { formatRinggit } from "../lib/utils";

export function DebtsView() {
  const [debts, setDebts] = useState<Debt[]>(() => getDebts());
  const [person, setPerson] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const unpaid = useMemo(() => debts.filter((d) => d.status === "unpaid"), [debts]);
  const paid = useMemo(() => debts.filter((d) => d.status === "paid"), [debts]);

  function handleAdd() {
    const amt = Number(amount);
    if (!person.trim() || !Number.isFinite(amt) || amt <= 0) return;
    addDebt({ person: person.trim(), amount: amt, note: note.trim() || undefined });
    setDebts(getDebts());
    setPerson("");
    setAmount("");
    setNote("");
  }

  function togglePaid(d: Debt) {
    if (d.status === "paid") {
      setDebtStatus(d.id, "unpaid");
    } else {
      markDebtPaid(d.id);
    }
    setDebts(getDebts());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-sm space-y-3">
        <div className="text-sm text-muted-foreground">Add Debt</div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border px-3 py-2" placeholder="Person" value={person} onChange={(e) => setPerson(e.target.value)} />
          <input className="w-28 rounded-md border px-3 py-2" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <input className="w-full rounded-md border px-3 py-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="w-full" onClick={handleAdd}>Add Debt</Button>
      </div>

      {unpaid.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm font-medium">Unpaid</div>
          <ul className="space-y-2">
            {unpaid.map((d) => (
              <li key={d.id} className="rounded-xl border p-3 bg-red-50 animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{d.person} - {formatRinggit(d.amount)}</div>
                    {d.note && <div className="text-xs text-muted-foreground">{d.note}</div>}
                  </div>
                  <Button variant="secondary" onClick={() => togglePaid(d)}>Mark Paid</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="text-sm font-medium">History</div>
        <ul className="space-y-2">
          {paid.map((d) => (
            <li key={d.id} className="rounded-xl border p-3 bg-green-50 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{d.person} - {formatRinggit(d.amount)}</div>
                  <div className="text-xs text-muted-foreground">Paid</div>
                </div>
                <Button variant="outline" onClick={() => togglePaid(d)}>Mark Unpaid</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}


