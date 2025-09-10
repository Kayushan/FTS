import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


const ringgitFormatter = new Intl.NumberFormat("ms-MY", {
  style: "currency",
  currency: "MYR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRinggit(amount: number): string {
  const formatted = ringgitFormatter.format(amount);
  // Ensure a space after RM for readability if missing (RM1.00 -> RM 1.00)
  return formatted.replace(/^RM(?=\d)/, "RM ");
}


