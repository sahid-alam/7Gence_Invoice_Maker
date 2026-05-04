import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@/types/app.types";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", backgroundColor: "#F5F0E8", paddingHorizontal: 52, paddingVertical: 48 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  invoiceTitle: { fontSize: 64, fontFamily: "PlayfairDisplay", fontWeight: 700, color: "#111", lineHeight: 1 },
  metaBlock: { textAlign: "right" },
  metaDate: { fontSize: 10, color: "#555" },
  metaNumber: { fontSize: 12, fontWeight: 700, color: "#111", marginTop: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#D4CFC5", marginVertical: 20 },
  label: { fontSize: 9, fontWeight: 700, color: "#777", marginBottom: 5 },
  name: { fontSize: 12, fontWeight: 700, color: "#111", marginBottom: 2 },
  line: { fontSize: 10, color: "#555", marginBottom: 2 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1.5, borderBottomColor: "#111", paddingBottom: 6, marginBottom: 4 },
  tableHeaderText: { fontSize: 9, fontWeight: 700, color: "#111" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D4CFC5", paddingVertical: 8 },
  descCol: { flex: 1, fontSize: 10, color: "#333" },
  amtCol: { width: 80, textAlign: "right", fontSize: 10, fontWeight: 700, color: "#111" },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  totalsBlock: { width: 180 },
  totalsLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalsLabel: { fontSize: 9, color: "#777" },
  totalsValue: { fontSize: 9, color: "#333" },
  totalFinalLabel: { fontSize: 13, fontWeight: 700, color: "#111" },
  totalFinalValue: { fontSize: 13, fontWeight: 700, color: "#111" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 20 },
  footerLeft: { flex: 1 },
  footerRight: { textAlign: "right" },
  paymentLabel: { fontSize: 9, fontWeight: 700, color: "#777", marginBottom: 4 },
  paymentLine: { fontSize: 9, color: "#555", marginBottom: 2 },
  walletAddress: { fontSize: 7, color: "#666", fontFamily: "Courier", marginTop: 2, maxWidth: 220 },
});

interface InvoiceData {
  invoice_number: string;
  issue_date: string;
  due_date?: string | null;
  currency: string;
  subtotal: number;
  tax_type: string;
  tax_amount: number;
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  tax_rate?: number | null;
  discount_amount: number;
  total: number;
  client_name: string;
  client_company?: string | null;
  client_address?: string | null;
  client_gstin?: string | null;
  sender_gstin?: string | null;
  notes?: string | null;
  payment_method_snapshot?: Record<string, string> | null;
  business_profiles?: {
    display_name?: string;
    email?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    gstin?: string;
    logo_url?: string;
  } | null;
  items: { description: string; quantity: number; unit_price: number }[];
}

export function TemplateCreamSerif({
  invoice,
  documentType = "invoice",
}: {
  invoice: InvoiceData;
  documentType?: "invoice" | "receipt";
}) {
  const cur = invoice.currency as CurrencyCode;
  const pm = invoice.payment_method_snapshot;
  const profile = invoice.business_profiles;
  const isReceipt = documentType === "receipt";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.invoiceTitle}>{isReceipt ? "Receipt" : "Invoice"}</Text>
          <View style={s.metaBlock}>
            <Text style={s.metaDate}>{invoice.issue_date}</Text>
            <Text style={s.metaNumber}>{isReceipt ? "Receipt No." : "Invoice No."} {invoice.invoice_number}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* From / To */}
        <View style={{ flexDirection: "row", gap: 40 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>From</Text>
            <Text style={s.name}>{profile?.display_name ?? ""}</Text>
            {profile?.address_line1 && <Text style={s.line}>{profile.address_line1}</Text>}
            {profile?.city && <Text style={s.line}>{profile.city}</Text>}
            {profile?.email && <Text style={s.line}>{profile.email}</Text>}
            {invoice.sender_gstin && <Text style={[s.line, { fontSize: 8 }]}>GSTIN: {invoice.sender_gstin}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>{isReceipt ? "Received From" : "Billed To"}</Text>
            <Text style={s.name}>{invoice.client_company || invoice.client_name}</Text>
            {invoice.client_address && <Text style={s.line}>{invoice.client_address}</Text>}
            {invoice.client_gstin && <Text style={[s.line, { fontSize: 8 }]}>GSTIN: {invoice.client_gstin}</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Invoice: items table + totals */}
        {!isReceipt && (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 1 }]}>Description</Text>
              <Text style={[s.tableHeaderText, { width: 80, textAlign: "right" }]}>Amount</Text>
            </View>
            {invoice.items.map((item, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={s.descCol}>{item.description}</Text>
                <Text style={s.amtCol}>{formatCurrency(item.quantity * item.unit_price, cur)}</Text>
              </View>
            ))}

            <View style={s.totalsRow}>
              <View style={s.totalsBlock}>
                {invoice.discount_amount > 0 && (
                  <View style={s.totalsLine}>
                    <Text style={s.totalsLabel}>Discount</Text>
                    <Text style={[s.totalsValue, { color: "#16a34a" }]}>−{formatCurrency(invoice.discount_amount, cur)}</Text>
                  </View>
                )}
                {invoice.tax_amount > 0 && (
                  <View style={s.totalsLine}>
                    <Text style={s.totalsLabel}>Tax</Text>
                    <Text style={s.totalsValue}>{formatCurrency(invoice.tax_amount, cur)}</Text>
                  </View>
                )}
                <View style={s.totalsLine}>
                  <Text style={s.totalFinalLabel}>Total Due</Text>
                  <Text style={s.totalFinalValue}>{formatCurrency(invoice.total, cur)}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Receipt: amount received */}
        {isReceipt && (
          <View style={s.totalsRow}>
            <View style={s.totalsBlock}>
              <View style={s.totalsLine}>
                <Text style={s.totalFinalLabel}>Amount Received</Text>
                <Text style={s.totalFinalValue}>{formatCurrency(invoice.total, cur)}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Footer: Payment Left / Notes Right */}
        <View style={s.divider} />
        <View style={s.footer}>
          <View style={s.footerLeft}>
            {pm ? (
              <>
                <Text style={s.paymentLabel}>
                  {isReceipt
                    ? "Paid Via"
                    : pm.type === "bank_transfer"
                    ? "Bank Details"
                    : pm.type === "crypto_wallet"
                    ? "Crypto Wallet"
                    : "UPI"}
                </Text>
                {pm.type === "bank_transfer" && (
                  <>
                    {pm.account_number && <Text style={s.paymentLine}>Account No. {pm.account_number}</Text>}
                    {pm.ifsc_code && <Text style={s.paymentLine}>IFSC Code {pm.ifsc_code}</Text>}
                    {pm.bank_name && <Text style={s.paymentLine}>Bank Name : {pm.bank_name}</Text>}
                    {pm.account_holder_name && <Text style={s.paymentLine}>Name : {pm.account_holder_name}</Text>}
                    {pm.swift_code && <Text style={s.paymentLine}>SWIFT: {pm.swift_code}</Text>}
                  </>
                )}
                {pm.type === "crypto_wallet" && (
                  <>
                    <Text style={s.paymentLine}>{pm.coin} / {pm.network}</Text>
                    <Text style={s.walletAddress}>{pm.wallet_address}</Text>
                    {pm.account_name && <Text style={s.paymentLine}>Account: {pm.account_name}</Text>}
                  </>
                )}
                {pm.type === "upi" && <Text style={s.paymentLine}>UPI: {pm.upi_id}</Text>}
              </>
            ) : null}
          </View>
          <View style={s.footerRight}>
            {invoice.notes && <Text style={[s.line, { fontStyle: "italic", maxWidth: 200 }]}>{invoice.notes}</Text>}
          </View>
        </View>
        <View style={s.divider} />
      </Page>
    </Document>
  );
}
