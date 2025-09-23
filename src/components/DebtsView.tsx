import { useMemo, useState } from "react";
import { addDebt, getDebts, markDebtPaid, setDebtStatus, type Debt } from "../lib/storage";
import { InputValidator } from "../lib/validation";
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
    // Validate person name
    const personValidation = InputValidator.validatePersonName(person);
    if (!personValidation.isValid) {
      console.error('Invalid person name:', personValidation.error);
      return;
    }
    
    // Validate amount
    const amountValidation = InputValidator.validateAmount(amount);
    if (!amountValidation.isValid) {
      console.error('Invalid amount:', amountValidation.error);
      return;
    }
    
    // Validate note (optional)
    const noteValidation = InputValidator.validateNote(note);
    if (!noteValidation.isValid) {
      console.error('Invalid note:', noteValidation.error);
      return;
    }
    
    const validatedAmount = amountValidation.value!;
    const validatedPerson = personValidation.value!;
    const validatedNote = noteValidation.value;
    
    addDebt({ person: validatedPerson, amount: validatedAmount, note: validatedNote });
    setDebts(getDebts());
    // Dispatch event to update main balance
    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
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
    // Dispatch event to update main balance
    window.dispatchEvent(new CustomEvent("fts-data-changed", { detail: { type: "debt" } }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-card p-4 shadow-sm space-y-3">
        <div className="text-sm text-muted-foreground">Add Receivable</div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-md border px-3 py-2" placeholder="Person" value={person} onChange={(e) => setPerson(e.target.value)} />
          <input className="w-28 rounded-md border px-3 py-2" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <input className="w-full rounded-md border px-3 py-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button className="w-full" onClick={handleAdd}>Add Receivable</Button>
      </div>

      {unpaid.length > 0 && (
        <section className="space-y-2">
          <div className="text-sm font-medium">Outstanding</div>
          <ul className="space-y-2">
            {unpaid.map((d) => (
              <li key={d.id} className="rounded-xl border p-3 bg-red-50 animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{d.person} - {formatRinggit(d.amount)}</div>
                    {d.note && <div className="text-xs text-muted-foreground">{d.note}</div>}
                  </div>
                  <Button variant="secondary" onClick={() => togglePaid(d)}>Mark Received</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <div className="text-sm font-medium">Received</div>
        <ul className="space-y-2">
          {paid.map((d) => (
            <li key={d.id} className="rounded-xl border p-3 bg-green-50 animate-in fade-in-0 zoom-in-95">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{d.person} - {formatRinggit(d.amount)}</div>
                  <div className="text-xs text-muted-foreground">Received</div>
                </div>
                <Button variant="outline" onClick={() => togglePaid(d)}>Mark Outstanding</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}


