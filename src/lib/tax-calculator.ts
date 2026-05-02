import type { TaxType } from "@/types/app.types";

export interface TaxCalculation {
  subtotal: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  discount_amount: number;
  total: number;
}

export function calculateTax(params: {
  subtotal: number;
  tax_type: TaxType;
  tax_rate: number;
  discount_percent: number;
}): TaxCalculation {
  const { subtotal, tax_type, tax_rate, discount_percent } = params;

  const discount_amount = subtotal * (discount_percent / 100);
  const taxable = subtotal - discount_amount;

  let cgst_amount = 0;
  let sgst_amount = 0;
  let igst_amount = 0;
  let tax_amount = 0;

  if (tax_type === "cgst_sgst") {
    cgst_amount = taxable * (tax_rate / 2 / 100);
    sgst_amount = taxable * (tax_rate / 2 / 100);
    tax_amount = cgst_amount + sgst_amount;
  } else if (tax_type === "igst" || tax_type === "custom") {
    igst_amount = taxable * (tax_rate / 100);
    tax_amount = igst_amount;
  }

  return {
    subtotal,
    tax_amount,
    cgst_amount,
    sgst_amount,
    igst_amount,
    discount_amount,
    total: taxable + tax_amount,
  };
}

export function suggestTaxType(senderCountry: string, clientCountry: string, senderState?: string, clientState?: string): TaxType {
  if (senderCountry !== "IN" || clientCountry !== "IN") return "none";
  if (!senderState || !clientState) return "igst";
  return senderState === clientState ? "cgst_sgst" : "igst";
}
