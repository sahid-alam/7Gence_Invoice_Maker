"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Shield, Trash2, User, Send } from "lucide-react";
import { addMember, removeMember, sendMemberInvite, type OrgMember } from "@/actions/members";

export function TeamSection({
  members,
  isOwner,
  orgName,
}: {
  members: OrgMember[];
  isOwner: boolean;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [added, setAdded] = useState<{ email: string; password: string | null } | null>(null);
  const router = useRouter();

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    try {
      // The password is generated on the server with a CSPRNG and comes back once.
      // It is never chosen in the browser, so it can't depend on Math.random().
      const result = await addMember(form);
      setAdded(result);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add them");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(m: OrgMember) {
    setSending(m.userId);
    try {
      const res = await sendMemberInvite(m.userId);
      // The reason arrives as data, so it survives production. A thrown error
      // would reach here as an opaque digest.
      if (res.ok) toast.success(`Sign-in link sent to ${m.email}`);
      else toast.error(res.message, { duration: 8000 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setSending(null);
    }
  }

  async function handleRemove(m: OrgMember) {
    if (!confirm(`Remove ${m.email} from ${orgName}? Their invoices and payments stay.`)) return;
    try {
      await removeMember(m.userId);
      toast.success("Removed from the organization");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove them");
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">Team members</h3>
            <p className="text-xs text-muted-foreground">
              Everyone here sees all of {orgName}&apos;s invoices and payments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">{members.length}</span>
            {isOwner && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <UserPlus size={14} className="mr-2" />
                Add member
              </Button>
            )}
          </div>
        </div>

        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
                {m.email.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.email}
                  {m.isYou && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
                </p>
                <p className="flex items-center gap-1 text-xs capitalize text-muted-foreground">
                  {m.role === "owner" ? <Shield size={11} /> : <User size={11} />}
                  {m.role}
                </p>
              </div>
              {isOwner && !m.isYou && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                    disabled={sending === m.userId}
                    onClick={() => handleInvite(m)}
                  >
                    <Send size={12} />
                    {sending === m.userId ? "Sending…" : "Email sign-in link"}
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${m.email}`}
                    onClick={() => handleRemove(m)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Credentials, shown once. */}
      {added && (
        <div className="rounded-2xl border border-green-500/40 bg-green-50 p-5 dark:bg-green-950/30">
          <p className="text-sm font-medium text-green-900 dark:text-green-200">
            {added.email} can sign in now
          </p>
          {added.password ? (
            <>
              <p className="mt-1 text-xs text-green-800 dark:text-green-300/90">
                Send them this password over something private — it isn&apos;t stored
                anywhere you can read it back, so if you lose it you&apos;ll have to
                reset it from Supabase.
              </p>
              <code className="mt-2 block break-all rounded-md border border-green-500/30 bg-card px-3 py-2 font-mono text-sm">
                {added.password}
              </code>
            </>
          ) : (
            <p className="mt-1 text-xs text-green-800 dark:text-green-300/90">
              That address already had an account, so they keep the password they
              already use — nothing was reset.
            </p>
          )}
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setAdded(null)}>
            Done
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add someone to {orgName}</DialogTitle>
            <DialogDescription>
              They get their own login and see everything in the organization. Their
              actions are recorded against their name in each invoice&apos;s activity.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" name="email" type="email" placeholder="anas@7gence.com" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role" name="role" defaultValue="member"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="member">Member — full access to invoices and payments</option>
                <option value="owner">Owner — can also add and remove people</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={loading}>
                {loading ? "Adding…" : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
