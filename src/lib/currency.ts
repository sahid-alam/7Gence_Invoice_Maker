import { CURRENCY_SYMBOLS, type CurrencyCode } from "@/types/app.types";

export function formatCurrency(amount: number, currency: CurrencyCode | string): string {
  const symbol = CURRENCY_SYMBOLS[currency as CurrencyCode] ?? currency;
  return `${symbol}${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAmount(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
