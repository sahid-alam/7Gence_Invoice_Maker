import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "@/components/invoices/import-form";

export default async function ImportInvoicePage() {
  const member = await requireMember();
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("business_profiles")
    .select("id, display_name, invoice_prefix")
    .eq("org_id", member.orgId)
    .order("is_default", { ascending: false })
    .order("display_name");

  return (
    <div className="max-w-4xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/invoices" aria-label="Back to invoices"><ArrowLeft size={16} /></Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Import invoices</h2>
          <p className="text-muted-foreground">
            Bring older PDF invoices into the books, keeping their original numbers.
          </p>
        </div>
      </div>

      <ImportForm profiles={profiles ?? []} />
    </div>
  );
}
