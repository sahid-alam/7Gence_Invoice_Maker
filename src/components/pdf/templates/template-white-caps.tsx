import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/currency";
import type { CurrencyCode } from "@/types/app.types";

const s = StyleSheet.create({
  page: { fontFamily: "Inter", backgroundColor: "#FFFFFF", paddingHorizontal: 52, paddingVertical: 48 },
  title: { fontSize: 36, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase" },
  meta: { fontSize: 9, color: "#666", marginTop: 4 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#E5E5E5", marginVertical: 20 },
  fromToRow: { flexDirection: "row", gap: 40 },
  section: { flex: 1 },
  label: { fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#888", marginBottom: 6 },
  name: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  line: { fontSize: 10, color: "#555", marginBottom: 2 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E5E5E5", paddingBottom: 6, marginBottom: 4 },
  tableHeaderText: { fontSize: 8, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#888" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F5F5F5", paddingVertical: 8 },
  descCol: { flex: 1, fontSize: 10 },
  numCol: { width: 40, textAlign: "right", fontSize: 10, color: "#555" },
  priceCol: { width: 80, textAlign: "right", fontSize: 10, color: "#555" },
  amtCol: { width: 80, textAlign: "right", fontSize: 10, fontWeight: 700 },
  totalsRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
  totalsBlock: { width: 200 },
  totalsLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalsLabel: { fontSize: 9, color: "#777" },
  totalsValue: { fontSize: 9 },
  totalFinalLabel: { fontSize: 13, fontWeight: 700 },
  totalFinalValue: { fontSize: 13, fontWeight: 700 },
  paymentTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  paymentLine: { fontSize: 9, color: "#555", marginBottom: 2 },
  walletAddress: { fontSize: 8, color: "#555", fontFamily: "Courier", marginTop: 2 },
  notes: { fontSize: 9, color: "#777", marginTop: 4 },
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
  client_email?: string | null;
  client_address?: string | null;
  client_gstin?: string | null;
  sender_gstin?: string | null;
  notes?: string | null;
  terms?: string | null;
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

export function TemplateWhiteCaps({
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={s.title}>{isReceipt ? "Receipt" : "Invoice"}</Text>
            <Text style={s.meta}>#{invoice.invoice_number}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {profile?.logo_url && (
              <Image src={profile.logo_url} style={{ width: 60, height: 60, objectFit: "contain", marginBottom: 6 }} />
            )}
            <Text style={s.meta}>{isReceipt ? "Paid:" : "Issued:"} {invoice.issue_date}</Text>
            {!isReceipt && invoice.due_date && <Text style={s.meta}>Due: {invoice.due_date}</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* From / To */}
        <View style={s.fromToRow}>
          <View style={s.section}>
            <Text style={s.label}>From</Text>
            <Text style={s.name}>{profile?.display_name ?? ""}</Text>
            {profile?.address_line1 && <Text style={s.line}>{profile.address_line1}</Text>}
            {profile?.city && <Text style={s.line}>{profile.city}</Text>}
            {profile?.email && <Text style={s.line}>{profile.email}</Text>}
            {invoice.sender_gstin && <Text style={[s.line, { fontSize: 8 }]}>GSTIN: {invoice.sender_gstin}</Text>}
          </View>
          <View style={s.section}>
            <Text style={s.label}>{isReceipt ? "Received From" : "To"}</Text>
            <Text style={s.name}>{invoice.client_name}</Text>
            {invoice.client_company && <Text style={s.line}>{invoice.client_company}</Text>}
            {invoice.client_address && <Text style={s.line}>{invoice.client_address}</Text>}
            {invoice.client_email && <Text style={s.line}>{invoice.client_email}</Text>}
            {invoice.client_gstin && <Text style={[s.line, { fontSize: 8 }]}>GSTIN: {invoice.client_gstin}</Text>}
          </View>
        </View>

        <View style={s.divider} />

        {/* Invoice: items table + totals */}
        {!isReceipt && (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.tableHeaderText, { flex: 1 }]}>Description</Text>
              <Text style={[s.tableHeaderText, { width: 40, textAlign: "right" }]}>Qty</Text>
              <Text style={[s.tableHeaderText, { width: 80, textAlign: "right" }]}>Price</Text>
              <Text style={[s.tableHeaderText, { width: 80, textAlign: "right" }]}>Total</Text>
            </View>
            {invoice.items.map((item, i) => (
              <View key={i} style={s.tableRow}>
                <Text style={s.descCol}>{item.description}</Text>
                <Text style={s.numCol}>{item.quantity}</Text>
                <Text style={s.priceCol}>{formatCurrency(item.unit_price, cur)}</Text>
                <Text style={s.amtCol}>{formatCurrency(item.quantity * item.unit_price, cur)}</Text>
              </View>
            ))}

            <View style={s.totalsRow}>
              <View style={s.totalsBlock}>
                <View style={s.totalsLine}>
                  <Text style={s.totalsLabel}>Subtotal</Text>
                  <Text style={s.totalsValue}>{formatCurrency(invoice.subtotal, cur)}</Text>
                </View>
                {invoice.discount_amount > 0 && (
                  <View style={s.totalsLine}>
                    <Text style={s.totalsLabel}>Discount</Text>
                    <Text style={[s.totalsValue, { color: "#16a34a" }]}>−{formatCurrency(invoice.discount_amount, cur)}</Text>
                  </View>
                )}
                {invoice.tax_type === "cgst_sgst" && (
                  <>
                    <View style={s.totalsLine}>
                      <Text style={s.totalsLabel}>CGST ({(Number(invoice.cgst_rate) * 100).toFixed(4).replace(/\.?0+$/, '')}%)</Text>
                      <Text style={s.totalsValue}>{formatCurrency(invoice.tax_amount / 2, cur)}</Text>
                    </View>
                    <View style={s.totalsLine}>
                      <Text style={s.totalsLabel}>SGST ({(Number(invoice.sgst_rate) * 100).toFixed(4).replace(/\.?0+$/, '')}%)</Text>
                      <Text style={s.totalsValue}>{formatCurrency(invoice.tax_amount / 2, cur)}</Text>
                    </View>
                  </>
                )}
                {(invoice.tax_type === "igst" || invoice.tax_type === "custom") && invoice.tax_amount > 0 && (
                  <View style={s.totalsLine}>
                    <Text style={s.totalsLabel}>
                      {invoice.tax_type === "igst" ? "IGST" : "Tax"} ({(Number(invoice.tax_rate) * 100).toFixed(4).replace(/\.?0+$/, '')}%)
                    </Text>
                    <Text style={s.totalsValue}>{formatCurrency(invoice.tax_amount, cur)}</Text>
                  </View>
                )}
                <View style={[s.divider, { marginVertical: 6 }]} />
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
              <View style={[s.divider, { marginVertical: 6 }]} />
              <View style={s.totalsLine}>
                <Text style={s.totalFinalLabel}>Amount Received</Text>
                <Text style={s.totalFinalValue}>{formatCurrency(invoice.total, cur)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Payment */}
        {pm && (
          <>
            <View style={s.divider} />
            <Text style={s.paymentTitle}>{isReceipt ? "Paid Via" : "Payment Method"}</Text>
            {pm.type === "crypto_wallet" && (
              <View>
                <Text style={s.paymentLine}>Payment to Wallet ({pm.coin} / {pm.network})</Text>
                <Text style={s.walletAddress}>{pm.wallet_address}</Text>
                {pm.account_name && <Text style={s.paymentLine}>Account Name: {pm.account_name}</Text>}
              </View>
            )}
            {pm.type === "bank_transfer" && (
              <View>
                <Text style={s.paymentLine}>Bank: {pm.bank_name}</Text>
                <Text style={s.paymentLine}>Account: {pm.account_number}</Text>
                {pm.ifsc_code && <Text style={s.paymentLine}>IFSC: {pm.ifsc_code}</Text>}
                {pm.swift_code && <Text style={s.paymentLine}>SWIFT: {pm.swift_code}</Text>}
                {pm.account_holder_name && <Text style={s.paymentLine}>Name: {pm.account_holder_name}</Text>}
              </View>
            )}
            {pm.type === "upi" && (
              <Text style={s.paymentLine}>UPI: {pm.upi_id}</Text>
            )}
          </>
        )}

        {/* Notes */}
        {invoice.notes && (
          <Text style={s.notes}>{invoice.notes}</Text>
        )}
      </Page>
    </Document>
  );
}
