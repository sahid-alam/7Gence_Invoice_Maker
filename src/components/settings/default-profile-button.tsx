"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { setMyDefaultProfile } from "@/actions/members";

/**
 * Which sender identity *you* invoice under by default. Per-person rather than
 * org-wide, because two people in the same organization can legitimately invoice
 * under different identities — that is the whole reason profiles are separate
 * from members.
 */
export function DefaultProfileButton({
  profileId,
  isDefault,
}: {
  profileId: string;
  isDefault: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (isDefault) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
        <Check size={10} /> your default
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await setMyDefaultProfile(profileId);
          toast.success("New invoices will use this identity");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not set default");
        } finally {
          setLoading(false);
        }
      }}
      className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
    >
      {loading ? "Saving…" : "Make default"}
    </button>
  );
}
