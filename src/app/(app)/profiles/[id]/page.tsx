import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateProfile, deleteProfile } from "@/actions/profiles";
import { INDIAN_STATES } from "@/types/app.types";
import { PaymentMethodsSection } from "@/components/profiles/payment-methods-section";
import { ArrowLeft } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "INR", "USDT"];
const TEMPLATES = [
  { id: "white-caps", label: "White – Classic Caps" },
  { id: "cream-serif", label: "Cream – Modern Serif" },
];

export default async function ProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [profileRes, paymentMethodsRes] = await Promise.all([
    supabase.from("business_profiles").select("*").eq("id", id).single(),
    supabase
      .from("payment_methods")
      .select("*")
      .eq("business_profile_id", id)
      .order("is_default", { ascending: false }),
  ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data;
  const paymentMethods = paymentMethodsRes.data ?? [];

  const updateWithId = updateProfile.bind(null, id);

  return (
    <div className="p-8 max-w-3xl space-y-6">
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
              <div className="space-y-2">
                <Label>State</Label>
                <select name="state" defaultValue={profile.state ?? ""} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input name="country" defaultValue={profile.country ?? "IN"} />
              </div>
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

            <div className="flex gap-3">
              <Button type="submit">Save Changes</Button>
              <form action={deleteProfile.bind(null, id)}>
                <Button type="submit" variant="destructive" size="sm">Delete Profile</Button>
              </form>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="payment" className="pt-4">
          <PaymentMethodsSection profileId={id} paymentMethods={paymentMethods} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
