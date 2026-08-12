import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateProfile } from "@/actions/profiles";
import { DeleteProfileButton } from "@/components/profiles/delete-profile-button";
import { PaymentMethodsSection } from "@/components/profiles/payment-methods-section";
import { CountryStateSelect } from "@/components/ui/country-state-select";
import { ArrowLeft } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "USDT"];
const TEMPLATES = [
  { id: "white-caps", label: "White – Classic Caps" },
  { id: "cream-serif", label: "Cream – Modern Serif" },
];

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  const supabase = await createClient();

  const [profileRes, paymentMethodsRes] = await Promise.all([
    supabase.from("business_profiles").select("*").eq("id", id).eq("org_id", member.orgId).single(),
    supabase
      .from("payment_methods")
      .select("*")
      .eq("business_profile_id", id)
      .eq("org_id", member.orgId)
      .order("is_default", { ascending: false }),
  ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data;
  const paymentMethods = paymentMethodsRes.data ?? [];

  const updateWithId = updateProfile.bind(null, id);

  return (
    <div className="p-4 sm:p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/profiles"><ArrowLeft size={16} /></Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{profile.display_name}</h2>
          <p className="text-muted-foreground text-sm">Business Profile</p>
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="payment">Payment Methods ({paymentMethods.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="pt-4">
          <form action={updateWithId} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Display Name *</Label>
                <Input name="display_name" defaultValue={profile.display_name} required />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Legal / Company Name</Label>
                <Input name="legal_name" defaultValue={profile.legal_name ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" defaultValue={profile.email ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={profile.phone ?? ""} />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Street Address</Label>
                <Input name="address_line1" defaultValue={profile.address_line1 ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input name="city" defaultValue={profile.city ?? ""} />
              </div>
              <CountryStateSelect
                defaultCountry={profile.country ?? "IN"}
                defaultState={profile.state ?? ""}
              />
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input name="postal_code" defaultValue={profile.postal_code ?? ""} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GSTIN</Label>
                <Input name="gstin" defaultValue={profile.gstin ?? ""} maxLength={15} />
              </div>
              <div className="space-y-2">
                <Label>PAN</Label>
                <Input name="pan" defaultValue={profile.pan ?? ""} maxLength={10} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Invoice Prefix</Label>
                <Input name="invoice_prefix" defaultValue={profile.invoice_prefix} maxLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <select name="default_currency" defaultValue={profile.default_currency} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  {CURRENCIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Default Template</Label>
                <select name="default_template_id" defaultValue={profile.default_template_id} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  {TEMPLATES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit">Save Changes</Button>
            </div>
          </form>

          {/* Outside the edit form — a nested <form> is invalid HTML and breaks
              hydration, which is why this button silently did nothing before. */}
          <div className="mt-4 flex items-center justify-end border-t border-border pt-4">
            <DeleteProfileButton profileId={id} profileName={profile.display_name} />
          </div>
        </TabsContent>

        <TabsContent value="payment" className="pt-4">
          <PaymentMethodsSection profileId={id} paymentMethods={paymentMethods} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
