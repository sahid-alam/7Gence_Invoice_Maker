import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Building2, Mail, Phone } from "lucide-react";

export default async function ProfilesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profiles } = await supabase
    .from("business_profiles")
    .select("id, display_name, email, phone, city, country, gstin, invoice_prefix, is_default")
    .eq("owner_id", user!.id)
    .order("is_default", { ascending: false })
    .order("display_name");

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Business Profiles</h2>
          <p className="text-muted-foreground">Manage your sender identities for invoices</p>
        </div>
        <Button asChild>
          <Link href="/profiles/new">
            <Plus size={16} className="mr-2" />
            New Profile
          </Link>
        </Button>
      </div>

      {(profiles?.length ?? 0) === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Building2 size={32} className="mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">No profiles yet</p>
          <p className="text-muted-foreground text-sm mt-1">Create a profile to start making invoices</p>
          <Button asChild className="mt-4">
            <Link href="/profiles/new">Create your first profile</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles?.map((profile) => (
            <Link key={profile.id} href={`/profiles/${profile.id}`}>
              <Card className="hover:border-foreground transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span>{profile.display_name}</span>
                    {profile.is_default && (
                      <span className="text-xs font-normal bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                        Default
                      </span>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground font-mono">Prefix: {profile.invoice_prefix}</p>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {profile.email && (
                    <div className="flex items-center gap-2">
                      <Mail size={12} />
                      <span>{profile.email}</span>
                    </div>
                  )}
                  {profile.phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={12} />
                      <span>{profile.phone}</span>
                    </div>
                  )}
                  {(profile.city || profile.country) && (
                    <p>{[profile.city, profile.country].filter(Boolean).join(", ")}</p>
                  )}
                  {profile.gstin && (
                    <p className="text-xs font-mono">GSTIN: {profile.gstin}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
