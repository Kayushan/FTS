import { useState } from "react";
import { Button } from "./ui/button";
import { Entry } from "../lib/storage";
import { formatRinggit } from "../lib/utils";
import { CategoryIcon } from "../lib/category-icons";

export function EntryItem({ entry, onDelete, readOnly = false }: { entry: Entry; onDelete: (id: string) => void; readOnly?: boolean }) {
  const time = new Date(entry.createdAt).toLocaleTimeString();
  const isIncome = entry.type === "income";
  const [isDeleting, setIsDeleting] = useState(false);

  function handleDelete() {
    setIsDeleting(true);
    window.setTimeout(() => onDelete(entry.id), 160);
  }

  return (
    <li
      className={`flex items-center justify-between rounded-xl border p-3 duration-150 ${
        isIncome ? "bg-green-50" : "bg-red-50"
      } ${isDeleting ? "animate-out fade-out-0 zoom-out-95" : "animate-in fade-in-0 zoom-in-95"}`}
    >
      <div className="flex items-start gap-2">
        <CategoryIcon name={entry.category} type={entry.type} className="mt-0.5" />
        <div>
          <div className="text-sm font-medium">
            {entry.category}
            {entry.note ? ` - ${entry.note}` : ""}
          </div>
          <div className="text-xs text-muted-foreground">{time}</div>
        </div>
      </div>
      <div className={`text-base font-bold ${isIncome ? "text-green-700" : "text-red-700"}`}>
        {isIncome ? "+" : "-"}{formatRinggit(entry.amount)}
      </div>
      <Button variant="ghost" onClick={handleDelete} disabled={readOnly}>
        Delete
      </Button>
    </li>
  );
}


