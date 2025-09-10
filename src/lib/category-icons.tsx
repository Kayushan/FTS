import type { ComponentType, SVGProps } from "react";
import {
  UtensilsCrossed,
  Car,
  Receipt,
  ShoppingCart,
  Heart,
  Film,
  ShoppingBag,
  MoreHorizontal,
  Wallet,
  Briefcase,
  Banknote,
  Gift,
  Percent,
  RotateCcw,
  Tag,
} from "lucide-react";
import { EntryType } from "./storage";
import { cn } from "./utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const EXPENSE_ICON_MAP: Record<string, IconComponent> = {
  food: UtensilsCrossed,
  transport: Car,
  bills: Receipt,
  groceries: ShoppingCart,
  health: Heart,
  entertainment: Film,
  shopping: ShoppingBag,
  other: MoreHorizontal,
};

const INCOME_ICON_MAP: Record<string, IconComponent> = {
  salary: Wallet,
  business: Briefcase,
  bonus: Banknote,
  gift: Gift,
  interest: Percent,
  refund: RotateCcw,
  other: MoreHorizontal,
};

export function getCategoryIconName(categoryName: string, type: EntryType): IconComponent {
  const key = categoryName.trim().toLowerCase();
  const map = type === "income" ? INCOME_ICON_MAP : EXPENSE_ICON_MAP;
  return map[key] || (type === "income" ? Banknote : Tag);
}

export function CategoryIcon({ name, type, className }: { name: string; type: EntryType; className?: string }) {
  const Icon = getCategoryIconName(name, type);
  return <Icon className={cn("h-4 w-4 text-muted-foreground", className)} aria-hidden />;
}


